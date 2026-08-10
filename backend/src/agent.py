import logging
import json
from typing import Optional

from dotenv import load_dotenv
from db import init_db, get_user_memory, save_user_memory
from facility_lookup import find_nearby_facilities
from livekit import rtc
from prompt import SYSTEM_PROMPT
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    RunContext,
    function_tool,
    cli,
    tokenize,
    room_io,
)
from livekit.plugins import murf, silero, google, deepgram, noise_cancellation
from livekit.plugins.turn_detector.multilingual import MultilingualModel

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


def resolve_user_location(context: RunContext) -> tuple[Optional[float], Optional[float], Optional[str]]:
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
        logger.info(f"Memory consent received. Saving caller memory user_id={caller_id}")
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
            return {"status": "error", "message": f"Save failed: {str(e)}"}

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
        if target_location and target_location.lower().strip() in ("near me", "my location", "here", "current location"):
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

    # Set up voice AI pipeline using Murf Falcon, Gemini, Deepgram, and Multilingual VAD
    session = AgentSession(
        stt=deepgram.STT(model="nova-3", language="multi"),
        llm=google.LLM(model="gemini-2.0-flash"),
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
        agent=Assistant(instructions=SYSTEM_PROMPT),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=lambda params: (
                    noise_cancellation.BVCTelephony()
                    if params.participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
                    else noise_cancellation.BVC()
                ),
            ),
        ),
    )

    # Join room and connect immediately
    await ctx.connect()


if __name__ == "__main__":
    cli.run_app(server)
