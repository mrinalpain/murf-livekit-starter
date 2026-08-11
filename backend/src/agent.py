import asyncio
import json
import logging
import time
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

from db import (
    cancel_user_followups,
    create_followup,
    get_user_memory,
    init_db,
    save_user_memory,
)
from facility_lookup import find_nearby_facilities
from prompt import SYSTEM_PROMPT

logger = logging.getLogger("agent")

load_dotenv(".env.local")

# Initialize SQLite database on startup
init_db()


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
        logger.info(f"Looking up caller user_id={caller_id}")
        try:
            record = get_user_memory(caller_id)
            if record:
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

        try:
            result = find_nearby_facilities(
                location=target_location,
                lat=user_lat,
                lon=user_lon,
                facility_type=facility_type or "government hospital",
                limit=limit or 3,
            )
            logger.info(
                f"Facility lookup result: success={result.get('success')}, "
                f"count={len(result.get('facilities', [])) if result.get('facilities') else 0}"
            )
            return result
        except Exception as e:
            logger.error(f"Facility lookup tool exception: {e}")
            return {
                "success": False,
                "error": "Healthcare facility lookup is temporarily unavailable.",
            }


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

    # Start session immediately so agent joins room without blocking
    await session.start(
        agent=Assistant(instructions=instructions),
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
