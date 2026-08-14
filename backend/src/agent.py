import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    RunContext,
    cli,
    function_tool,
    room_io,
    tokenize,
)
from livekit.plugins import deepgram, google, murf, noise_cancellation, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from analytics import end_call, start_call
from db import (
    cancel_user_followups,
    create_escalation_record,
    create_followup,
    get_user_memory,
    init_db,
    save_user_memory,
)
from facility_lookup import find_nearby_facilities
from prompt import CLINIC_SPECIALIST_PROMPT, SYSTEM_PROMPT

logger = logging.getLogger("agent")

load_dotenv(".env.local")

# Initialize SQLite database on startup
init_db()


class CallTracker:
    def __init__(
        self,
        call_id: str,
        channel: str = "browser",
        user_id: str = "caller_default",
        language: str = "Unknown",
    ) -> None:
        self.call_id = call_id
        self.channel = channel
        self.user_id = user_id
        self.language = language
        self.started_at = datetime.now(timezone.utc)
        self.guidance_provided = False
        self.escalation_created = False
        self.tool_failed = False
        self.user_spoke = False
        self.agent_spoke = False
        self.agent_path: list[str] = ["main"]

    def record_agent(self, agent_name: str) -> None:
        if not self.agent_path or self.agent_path[-1] != agent_name:
            self.agent_path.append(agent_name)

    @property
    def agent_path_str(self) -> str:
        return " → ".join(self.agent_path) if self.agent_path else "main"


def get_session_tracker(context: RunContext) -> Optional[CallTracker]:
    """Helper to access CallTracker attached to active AgentSession."""
    if context and hasattr(context, "session") and context.session:
        try:
            ud = context.session.userdata
            if isinstance(ud, dict):
                return ud.get("tracker")
            elif isinstance(ud, CallTracker):
                return ud
        except ValueError:
            return None
    return None


def resolve_user_id(context: RunContext, user_id: Optional[str] = None) -> str:
    """Helper to resolve caller's user_id from arguments or connected LiveKit participant."""
    if user_id and user_id.strip() and user_id != "caller_default":
        return user_id.strip()
    if (
        context
        and hasattr(context, "session")
        and context.session
        and hasattr(context.session, "room")
        and context.session.room
        and context.session.room.remote_participants
    ):
        identities = list(context.session.room.remote_participants.keys())
        if identities:
            return identities[0]
    return user_id or "caller_default"


def resolve_user_location(
    context: RunContext,
) -> tuple[Optional[float], Optional[float], Optional[str]]:
    """Helper to extract browser geolocation (lat, lon) or location name from participant metadata."""
    if (
        context
        and hasattr(context, "session")
        and context.session
        and hasattr(context.session, "room")
        and context.session.room
        and context.session.room.remote_participants
    ):
        for participant in context.session.room.remote_participants.values():
            if hasattr(participant, "metadata") and participant.metadata:
                try:
                    meta = json.loads(participant.metadata)
                    if isinstance(meta, dict):
                        loc_meta = meta.get("location")
                        if isinstance(loc_meta, dict):
                            lat = loc_meta.get("lat") or loc_meta.get("latitude")
                            lon = loc_meta.get("lng") or loc_meta.get("longitude")
                            city = loc_meta.get("city") or loc_meta.get("name")
                            if lat is not None and lon is not None:
                                return float(lat), float(lon), city
                        elif isinstance(loc_meta, str) and loc_meta.strip():
                            return None, None, loc_meta.strip()
                except Exception:
                    pass
    return None, None, None


class Assistant(Agent):
    def __init__(self, instructions: str = SYSTEM_PROMPT) -> None:
        super().__init__(instructions=instructions)

    @function_tool
    async def lookup_user(self, context: RunContext, user_id: Optional[str] = None):
        """Retrieve stored caller information using their user_id.

        Args:
            user_id: Unique identifier for the caller (optional, auto-detected if omitted)
        """
        caller_id = resolve_user_id(context, user_id)
        tracker = get_session_tracker(context)
        if tracker:
            tracker.user_id = caller_id
        logger.info(f"Looking up caller user_id={caller_id}")
        try:
            record = get_user_memory(caller_id)
            if record:
                if tracker and record.get("language_preference"):
                    tracker.language = record.get("language_preference")
                logger.info(f"Returning caller found user_id={caller_id}")
                return {
                    "status": "returning_caller",
                    "user_id": caller_id,
                    "name": record.get("name"),
                    "language_preference": record.get("language_preference"),
                    "age_band": record.get("age_band"),
                    "last_triage_outcome": record.get("last_triage_outcome"),
                    "last_interaction": record.get("last_interaction"),
                }
            else:
                logger.info(f"New caller user_id={caller_id}")
                return {
                    "status": "new_caller",
                    "user_id": caller_id,
                    "message": "Caller is new. No prior memory found.",
                }
        except Exception as e:
            logger.error(f"Memory lookup failed user_id={caller_id}: {e}")
            return {
                "status": "new_caller",
                "user_id": caller_id,
                "message": "Memory temporarily unavailable.",
            }

    @function_tool
    async def save_user(
        self,
        context: RunContext,
        user_id: Optional[str] = None,
        name: Optional[str] = None,
        language_preference: Optional[str] = None,
        age_band: Optional[str] = None,
        last_triage_outcome: Optional[str] = None,
    ):
        """Save or update caller information after explicit consent has been received.

        Args:
            user_id: Unique identifier for the caller (optional, auto-detected if omitted)
            name: Caller's name (optional)
            language_preference: Preferred language such as Hindi, Bengali, English (optional)
            age_band: Caller's age group, e.g. '40-49' (optional)
            last_triage_outcome: Triage outcome or health summary (optional)
        """
        caller_id = resolve_user_id(context, user_id)
        tracker = get_session_tracker(context)
        if tracker:
            tracker.user_id = caller_id
            if language_preference:
                tracker.language = language_preference
        logger.info(
            f"Memory consent received. Saving caller memory user_id={caller_id}"
        )
        try:
            success = save_user_memory(
                user_id=caller_id,
                name=name,
                language_preference=language_preference,
                age_band=age_band,
                last_triage_outcome=last_triage_outcome,
            )
            if success:
                logger.info(f"Memory saved successfully user_id={caller_id}")
                return {"status": "success", "message": "Memory saved successfully."}
            else:
                logger.error(f"Failed to save memory user_id={caller_id}")
                return {"status": "error", "message": "Failed to save memory."}
        except Exception as e:
            logger.error(f"Memory save failed user_id={caller_id}: {e}")
            return {"status": "error", "message": f"Save failed: {e!s}"}

    @function_tool
    async def schedule_health_followup(
        self,
        context: RunContext,
        user_id: Optional[str] = None,
        scheduled_time: Optional[str] = None,
        reason: Optional[str] = None,
        phone_number: Optional[str] = None,
    ):
        """Schedule an outbound healthcare follow-up call for a caller after receiving explicit consent.

        Use this tool ONLY when:
        - The caller explicitly agrees to receive a follow-up call ("Yes", "Sure", "Tomorrow at 10 AM").
        - You have explained that Swasthya Sathi will call them back to check on their health.

        Safety rules & boundaries:
        - MUST NOT be used without explicit user consent.
        - MUST NOT be used for emergency calls or life-threatening symptoms (use emergency escalation instead).
        - MUST NOT diagnose conditions or prescribe medications.
        - MUST NOT schedule repeated calls without explicit consent for each call.

        Args:
            user_id: Unique identifier for the caller (optional, auto-detected if omitted)
            scheduled_time: Requested date/time for the follow-up call (e.g. 'Tomorrow at 10 AM')
            reason: Minimal summary of reason for follow-up (e.g. 'Follow-up after leg pain consultation')
            phone_number: Phone number or SIP URI if provided by caller (optional)
        """
        caller_id = resolve_user_id(context, user_id)
        logger.info(
            f"Scheduling health follow-up for user_id={caller_id}, time='{scheduled_time}', reason='{reason}'"
        )
        try:
            fid = create_followup(
                user_id=caller_id,
                phone_number=phone_number,
                reason=reason or "Follow-up after health consultation",
                scheduled_at=scheduled_time,
                consent=True,
            )
            if fid:
                logger.info(
                    f"Follow-up scheduled successfully id={fid} for user_id={caller_id}"
                )
                return {
                    "status": "success",
                    "followup_id": fid,
                    "user_id": caller_id,
                    "message": f"Follow-up call scheduled for {scheduled_time or 'tomorrow'}.",
                }
            else:
                return {
                    "status": "error",
                    "message": "Failed to record follow-up schedule.",
                }
        except Exception as e:
            logger.error(f"Failed to schedule follow-up: {e}")
            return {"status": "error", "message": str(e)}

    @function_tool
    async def cancel_health_followup(
        self,
        context: RunContext,
        user_id: Optional[str] = None,
    ):
        """Cancel all pending health follow-up calls for the caller (opt-out).

        Use this tool whenever the caller requests to opt out of follow-up calls (e.g. 'Don't call me again', 'Stop calling me', 'Cancel my follow-up').

        Args:
            user_id: Unique identifier for the caller (optional, auto-detected if omitted)
        """
        caller_id = resolve_user_id(context, user_id)
        logger.info(
            f"Opt-out request received. Cancelling follow-ups for user_id={caller_id}"
        )
        try:
            success = cancel_user_followups(caller_id)
            if success:
                return {
                    "status": "success",
                    "user_id": caller_id,
                    "message": "All scheduled follow-up calls have been cancelled.",
                }
            return {"status": "error", "message": "Failed to cancel follow-ups."}
        except Exception as e:
            logger.error(f"Failed to cancel follow-ups: {e}")
            return {"status": "error", "message": str(e)}

    @function_tool
    async def find_nearby_healthcare_facility(
        self,
        context: RunContext,
        location: Optional[str] = None,
        facility_type: Optional[str] = "government hospital",
        limit: int = 3,
    ):
        """Find nearby real healthcare facilities such as government hospitals, Primary Health Centres (PHC), Community Health Centres (CHC), clinics, or health centres.

        Use this tool ONLY when:
        - The user asks for a nearby healthcare facility, hospital, PHC, CHC, clinic, or health centre.

        Do NOT use this tool for general medical advice or symptoms without a facility lookup request.
        Do NOT fabricate facility information.
        Requires a location. If location is unknown and not auto-detected from browser context, ask the caller for their city or area first.

        Args:
            location: City, area name, landmark, or coordinates (optional if auto-detected from caller context)
            facility_type: Type of facility requested, e.g. 'government hospital', 'PHC', 'CHC', 'clinic', 'hospital'
            limit: Maximum number of facilities to return (default 3)
        """
        user_lat, user_lon, auto_loc = resolve_user_location(context)
        target_location = location or auto_loc

        # Clean generic location phrases if LLM passes "near me" or "my location"
        if target_location and target_location.lower().strip() in (
            "near me",
            "my location",
            "here",
            "current location",
        ):
            target_location = auto_loc

        logger.info(
            f"Tool find_nearby_healthcare_facility called: location='{target_location}', "
            f"lat={user_lat}, lon={user_lon}, facility_type='{facility_type}', limit={limit}"
        )

        tracker = get_session_tracker(context)
        try:
            result = find_nearby_facilities(
                location=target_location,
                lat=user_lat,
                lon=user_lon,
                facility_type=facility_type or "government hospital",
                limit=limit or 3,
            )
            if result.get("success"):
                if tracker:
                    tracker.guidance_provided = True
            else:
                if tracker:
                    tracker.tool_failed = True
            logger.info(
                f"Facility lookup result: success={result.get('success')}, "
                f"count={len(result.get('facilities', [])) if result.get('facilities') else 0}"
            )
            return result
        except Exception as e:
            if tracker:
                tracker.tool_failed = True
            logger.error(f"Facility lookup tool exception: {e}")
            return {
                "success": False,
                "error": "Healthcare facility lookup is temporarily unavailable.",
            }

    @function_tool
    async def create_escalation(
        self,
        context: RunContext,
        summary: str,
        urgency: str = "medium",
        language: Optional[str] = None,
        preferred_follow_up: Optional[str] = None,
        user_id: Optional[str] = None,
    ):
        """Create a human healthcare escalation request in the system after receiving explicit caller consent.

        MUST ONLY be called after:
        1. Explaining to the caller what information will be shared with a human healthcare professional.
        2. Asking for explicit caller consent ("Would you like me to share those details?").
        3. Receiving explicit caller agreement ("Yes", "Sure", "Okay").

        DO NOT call this tool if:
        - The caller has not been asked for consent.
        - The caller refused consent ("No").
        - The caller is having a normal health conversation without emergency or diagnosis escalation triggers.

        Args:
            summary: Privacy-safe short summary of the issue (e.g. 'Severe chest pain and difficulty breathing. Recommended emergency care.')
            urgency: Urgency level ('emergency', 'high', 'medium', 'low')
            language: Caller's spoken language, e.g. 'English', 'Hindi', 'Bengali'
            preferred_follow_up: Preferred follow-up method, e.g. 'Phone', 'Clinic Visit'
            user_id: Unique caller identifier (optional, auto-detected if omitted)
        """
        caller_id = resolve_user_id(context, user_id)
        tracker = get_session_tracker(context)
        logger.info(
            f"Tool create_escalation called: user_id={caller_id}, "
            f"urgency='{urgency}', language='{language}'"
        )
        try:
            res = create_escalation_record(
                user_id=caller_id,
                summary=summary,
                urgency=urgency,
                language=language,
                preferred_follow_up=preferred_follow_up,
            )
            if res.get("success") and tracker:
                tracker.escalation_created = True
                tracker.guidance_provided = True
                if language:
                    tracker.language = language
            logger.info(f"create_escalation tool result: {res}")
            return res
        except Exception as e:
            logger.error(f"create_escalation tool exception: {e}")
            return {
                "success": False,
                "message": "Unable to create the escalation request.",
            }

    @function_tool
    async def transfer_to_clinic_specialist(self, context: RunContext):
        """Transfer the conversation to the Clinic and Appointment Specialist when the user needs help specifically with healthcare facility selection, clinic questions, doctor appointments, appointment scheduling, preferred appointment dates/times, or appointment-related information.

        Do not use this handoff for general health questions, symptom guidance, diagnosis requests, medication questions, or emergency situations.
        """
        logger.info("Main agent transferring to Clinic and Appointment Specialist")
        tracker = get_session_tracker(context)
        if tracker:
            tracker.record_agent("clinic_specialist")
            tracker.guidance_provided = True

        session = context.session
        if not session:
            return "I couldn't connect you to the clinic specialist right now, but I can still help with what I can."

        clinic_agent = None
        if isinstance(session.userdata, dict):
            clinic_agent = session.userdata.get("clinic_agent")
        if not clinic_agent:
            clinic_agent = ClinicAppointmentAgent()
            if isinstance(session.userdata, dict):
                session.userdata["clinic_agent"] = clinic_agent

        try:
            # Voice announcement before handoff
            await session.say(
                "I can help with that. I'll connect you with our clinic and appointment specialist."
            )
            # Perform LiveKit native agent handoff
            session.update_agent(clinic_agent)
            return (
                "Handoff complete. You are now the active Swasthya Sathi Clinic and Appointment Specialist speaking directly to the caller. "
                "Introduce yourself immediately as the clinic specialist, acknowledge what the user requested from prior history, "
                "and ask your follow-up questions regarding preferred appointment date, time, or location right away."
            )
        except Exception as e:
            logger.error(f"Failed to hand off to clinic specialist: {e}")
            if tracker:
                tracker.tool_failed = True
            return "I couldn't connect you to the clinic specialist right now, but I can still help with what I can."


class ClinicAppointmentAgent(Agent):
    def __init__(self, instructions: str = CLINIC_SPECIALIST_PROMPT) -> None:
        super().__init__(instructions=instructions)

    @function_tool
    async def lookup_user(self, context: RunContext, user_id: Optional[str] = None):
        """Retrieve stored caller information using their user_id.

        Args:
            user_id: Unique identifier for the caller (optional, auto-detected if omitted)
        """
        caller_id = resolve_user_id(context, user_id)
        tracker = get_session_tracker(context)
        if tracker:
            tracker.user_id = caller_id
        logger.info(f"Specialist looking up caller user_id={caller_id}")
        try:
            record = get_user_memory(caller_id)
            if record:
                if tracker and record.get("language_preference"):
                    tracker.language = record.get("language_preference")
                logger.info(f"Specialist returning caller found user_id={caller_id}")
                return {
                    "status": "returning_caller",
                    "user_id": caller_id,
                    "name": record.get("name"),
                    "language_preference": record.get("language_preference"),
                    "age_band": record.get("age_band"),
                    "last_triage_outcome": record.get("last_triage_outcome"),
                    "last_interaction": record.get("last_interaction"),
                }
            else:
                logger.info(f"Specialist new caller user_id={caller_id}")
                return {
                    "status": "new_caller",
                    "user_id": caller_id,
                    "message": "Caller is new. No prior memory found.",
                }
        except Exception as e:
            logger.error(f"Specialist memory lookup failed user_id={caller_id}: {e}")
            return {
                "status": "new_caller",
                "user_id": caller_id,
                "message": "Memory temporarily unavailable.",
            }

    @function_tool
    async def find_nearby_healthcare_facility(
        self,
        context: RunContext,
        location: Optional[str] = None,
        facility_type: Optional[str] = "government hospital",
        limit: int = 3,
    ):
        """Find nearby real healthcare facilities such as government hospitals, Primary Health Centres (PHC), Community Health Centres (CHC), clinics, or health centres.

        Use this tool ONLY when:
        - The user asks for a nearby healthcare facility, hospital, PHC, CHC, clinic, or health centre.

        Do NOT fabricate facility information.
        Requires a location. If location is unknown and not auto-detected from caller context, ask the caller for their city or area first.

        Args:
            location: City, area name, landmark, or coordinates (optional if auto-detected from caller context)
            facility_type: Type of facility requested, e.g. 'government hospital', 'PHC', 'CHC', 'clinic', 'hospital'
            limit: Maximum number of facilities to return (default 3)
        """
        user_lat, user_lon, auto_loc = resolve_user_location(context)
        target_location = location or auto_loc

        if target_location and target_location.lower().strip() in (
            "near me",
            "my location",
            "here",
            "current location",
        ):
            target_location = auto_loc

        logger.info(
            f"Specialist find_nearby_healthcare_facility: location='{target_location}', "
            f"lat={user_lat}, lon={user_lon}, facility_type='{facility_type}', limit={limit}"
        )

        tracker = get_session_tracker(context)
        try:
            result = find_nearby_facilities(
                location=target_location,
                lat=user_lat,
                lon=user_lon,
                facility_type=facility_type or "government hospital",
                limit=limit or 3,
            )
            if result.get("success"):
                if tracker:
                    tracker.guidance_provided = True
            else:
                if tracker:
                    tracker.tool_failed = True
            logger.info(
                f"Specialist facility lookup result: success={result.get('success')}, "
                f"count={len(result.get('facilities', [])) if result.get('facilities') else 0}"
            )
            return result
        except Exception as e:
            if tracker:
                tracker.tool_failed = True
            logger.error(f"Specialist facility lookup exception: {e}")
            return {
                "success": False,
                "error": "Healthcare facility lookup is temporarily unavailable.",
            }

    @function_tool
    async def transfer_to_main_assistant(self, context: RunContext):
        """Transfer the conversation back to the main Swasthya Sathi health assistant when the user asks about general health guidance, common symptoms (fever, cold, cough, headache), medication questions, health schemes, or non-appointment topics.

        Do not use this tool if the user is still asking about clinics, hospitals, or appointments.
        """
        logger.info("Specialist transferring back to Main Healthcare Assistant")
        tracker = get_session_tracker(context)
        if tracker:
            tracker.record_agent("main")
            tracker.guidance_provided = True

        session = context.session
        if not session:
            return "I couldn't transfer you back right now, but I can still help."

        main_agent = None
        if isinstance(session.userdata, dict):
            main_agent = session.userdata.get("main_agent")
        if not main_agent:
            main_agent = Assistant()
            if isinstance(session.userdata, dict):
                session.userdata["main_agent"] = main_agent

        try:
            # Voice announcement to user before reverse handoff
            await session.say(
                "I'll connect you back with our main healthcare assistant."
            )
            # Switch active agent in session back to main agent
            session.update_agent(main_agent)
            return (
                "Handoff complete. You are now the main Swasthya Sathi Healthcare Assistant speaking directly to the caller. "
                "Acknowledge the caller's symptom or health question directly from history and provide guidance or ask relevant follow-up questions."
            )
        except Exception as e:
            logger.error(f"Failed reverse handoff to main assistant: {e}")
            return "I couldn't transfer you back right now, but I can still help."


server = AgentServer()


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session(agent_name="my-agent")
async def my_agent(ctx: JobContext):
    # Logging setup
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    is_outbound = ctx.room.name.startswith("outbound-")
    if not is_outbound and ctx.room.metadata:
        try:
            m = json.loads(ctx.room.metadata)
            if isinstance(m, dict) and m.get("is_outbound"):
                is_outbound = True
        except Exception:
            pass

    instructions = SYSTEM_PROMPT
    if is_outbound:
        instructions += (
            "\n\n====================================================\n"
            "CURRENT SESSION IS AN OUTBOUND CALL\n"
            "====================================================\n"
            "You have just initiated an outbound follow-up call to the user.\n"
            "Start IMMEDIATELY with the mandatory four-part outbound greeting:\n"
            "1. Who is calling ('Namaste, this is Swasthya Sathi, your healthcare voice assistant.')\n"
            "2. Why calling ('I'm calling to follow up on the health concern we discussed earlier.')\n"
            "3. How to stop future calls ('If you don't want to receive these follow-up calls, just tell me and I'll stop.')\n"
            "4. Ask: 'Is this a good time to talk?'\n\n"
            "First call lookup_user to check for saved caller name and language preference."
        )

    call_id = ctx.room.name
    is_sip = is_outbound
    if not is_sip and (
        ctx.room.name.startswith("sip-")
        or (ctx.room.metadata and "sip" in ctx.room.metadata.lower())
    ):
        is_sip = True

    channel = "sip" if is_sip else "browser"
    tracker = CallTracker(
        call_id=call_id,
        channel=channel,
        user_id="caller_default",
        language="Unknown",
    )

    start_call(
        call_id=call_id,
        user_id="caller_default",
        channel=channel,
        language="Unknown",
        agent_path=tracker.agent_path_str,
    )

    # Set up voice AI pipeline using Murf Falcon, Gemini, Deepgram, and Multilingual VAD
    session = AgentSession(
        stt=deepgram.STT(model="nova-3", language="multi"),
        llm=google.LLM(model="gemini-3.5-flash-lite"),
        tts=murf.TTS(
            voice="Anisha",
            style="Conversation",
            tokenizer=tokenize.basic.SentenceTokenizer(min_sentence_len=2),
            text_pacing=True,
        ),
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
    )

    main_agent = Assistant(instructions=instructions)
    clinic_agent = ClinicAppointmentAgent()

    session.userdata = {
        "tracker": tracker,
        "main_agent": main_agent,
        "clinic_agent": clinic_agent,
    }

    # Event listeners for call tracking
    def _on_conversation_item(ev=None):
        if ev and hasattr(ev, "item"):
            role = str(getattr(ev.item, "role", "")).lower()
            if role in ("user", "human"):
                tracker.user_spoke = True
            elif role in ("assistant", "system"):
                tracker.agent_spoke = True
        if (tracker.user_spoke or tracker.agent_spoke) and not tracker.tool_failed:
            tracker.guidance_provided = True

    def _on_user_input(ev=None):
        tracker.user_spoke = True
        if not tracker.tool_failed:
            tracker.guidance_provided = True

    def _on_user_state_changed(ev=None):
        tracker.user_spoke = True
        if not tracker.tool_failed:
            tracker.guidance_provided = True

    try:
        session.on("user_input_transcribed", _on_user_input)
        session.on("conversation_item_added", _on_conversation_item)
        session.on("user_state_changed", _on_user_state_changed)
    except Exception as e:
        logger.warning(f"Could not attach session event listeners: {e}")

    async def _on_shutdown(reason: str = "") -> None:
        ended_at_dt = datetime.now(timezone.utc)
        duration_sec = max(0, int((ended_at_dt - tracker.started_at).total_seconds()))

        if tracker.escalation_created:
            outcome = "success"
            outcome_reason = "human_escalation"
        elif (
            tracker.guidance_provided
            or tracker.user_spoke
            or tracker.agent_spoke
            or duration_sec >= 10
        ) and not tracker.tool_failed:
            outcome = "success"
            outcome_reason = "guidance_provided"
        elif tracker.tool_failed:
            outcome = "failed"
            outcome_reason = "tool_failure"
        elif not tracker.user_spoke and duration_sec < 5:
            outcome = "failed"
            outcome_reason = "no_response"
        else:
            outcome = "failed"
            outcome_reason = "incomplete_conversation"

        end_call(
            call_id=tracker.call_id,
            outcome=outcome,
            outcome_reason=outcome_reason,
            ended_at=ended_at_dt.isoformat(),
            duration_seconds=duration_sec,
            language=tracker.language,
            agent_path=tracker.agent_path_str,
        )

    ctx.add_shutdown_callback(_on_shutdown)

    # Start session immediately so agent joins room without blocking
    await session.start(
        agent=main_agent,
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind
                    == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else noise_cancellation.BVC()
                ),
            ),
        ),
    )

    # Join room and connect immediately
    await ctx.connect()

    if is_outbound:
        logger.info("Outbound SIP session connected — waiting for SIP participant...")
        participant = await ctx.wait_for_participant()
        logger.info(f"SIP Participant joined room: {participant.identity}")

        # Brief 0.5s pause to ensure RTP audio stream is open on Linphone
        await asyncio.sleep(0.5)

        logger.info("Speaking outbound greeting via Murf Falcon TTS...")
        await session.say(
            "Namaste, this is Swasthya Sathi, your healthcare voice assistant. "
            "I'm calling to follow up on the health concern we discussed earlier. "
            "If you don't want to receive these follow-up calls, just tell me and I'll stop. "
            "Is this a good time to talk?"
        )


if __name__ == "__main__":
    cli.run_app(server)
