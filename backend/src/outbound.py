import json
import logging
import os
import time
from typing import Any, Optional

from dotenv import load_dotenv
from livekit.api import (
    CreateAgentDispatchRequest,
    CreateSIPParticipantRequest,
    LiveKitAPI,
)

from db import (
    create_followup,
    get_followup,
    update_followup_status,
)

logger = logging.getLogger("agent.outbound")
load_dotenv(".env.local")


async def make_outbound_call(
    followup_id: Optional[int] = None,
    destination: Optional[str] = None,
    user_id: Optional[str] = None,
    reason: Optional[str] = None,
) -> dict[str, Any]:
    """
    Backend function for initiating an outbound SIP call using LiveKit + Linphone configuration.

    1. Loads follow-up record if followup_id provided or creates a test record.
    2. Verifies consent is True (1) and status is not 'cancelled'.
    3. Creates LiveKit room.
    4. Initiates outbound SIP call via LiveKit API (CreateSIPParticipantRequest).
    5. Connects call to Swasthya Sathi agent.
    6. Updates follow-up status in SQLite database.
    """
    trunk_id = os.getenv("LIVEKIT_SIP_TRUNK_ID")
    target_destination = (
        destination
        or os.getenv("OUTBOUND_TEST_DESTINATION")
        or os.getenv("LINPHONE_SIP_URI")
    )

    if not trunk_id:
        logger.error("LIVEKIT_SIP_TRUNK_ID is not configured in environment variables.")
        return {"success": False, "error": "SIP trunk ID not configured."}

    if not target_destination:
        logger.error(
            "No SIP destination specified and LINPHONE_SIP_URI / OUTBOUND_TEST_DESTINATION is missing."
        )
        return {"success": False, "error": "SIP destination missing."}

    followup = None
    if followup_id:
        followup = get_followup(followup_id)
        if not followup:
            logger.error(f"Follow-up ID {followup_id} not found.")
            return {"success": False, "error": f"Follow-up ID {followup_id} not found."}
    elif user_id:
        fid = create_followup(
            user_id=user_id,
            phone_number=target_destination,
            reason=reason or "Outbound healthcare follow-up",
            consent=True,
        )
        if fid:
            followup = get_followup(fid)

    if followup:
        if followup.get("consent") != 1:
            logger.warning(
                f"Follow-up {followup['id']} cannot be called: explicit consent missing."
            )
            return {"success": False, "error": "Consent missing or revoked."}
        if followup.get("status") == "cancelled":
            logger.warning(f"Follow-up {followup['id']} was cancelled by user.")
            return {"success": False, "error": "Follow-up was cancelled."}

    room_name = f"outbound-followup-{int(time.time())}"
    caller_user_id = (
        (followup and followup.get("user_id")) or user_id or "caller_default"
    )
    fid_val = followup["id"] if followup else None

    if fid_val:
        update_followup_status(fid_val, "calling")

    livekit_url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")

    logger.info(
        f"Initiating outbound SIP call via trunk {trunk_id} to destination "
        f"in room {room_name} for user {caller_user_id}"
    )

    try:
        lk_api = LiveKitAPI(url=livekit_url, api_key=api_key, api_secret=api_secret)

        clean_sip_call_to = target_destination
        if clean_sip_call_to.startswith("sip:"):
            clean_sip_call_to = clean_sip_call_to[4:]
        if "@" in clean_sip_call_to:
            clean_sip_call_to = clean_sip_call_to.split("@")[0]

        participant_metadata = json.dumps(
            {
                "is_outbound": True,
                "followup_id": fid_val,
                "user_id": caller_user_id,
                "reason": followup.get("reason")
                if followup
                else (reason or "Healthcare follow-up"),
            }
        )

        agent_name = os.environ.get("AGENT_NAME", "my-agent")
        try:
            dispatch_req = CreateAgentDispatchRequest(
                agent_name=agent_name,
                room=room_name,
                metadata=participant_metadata,
            )
            await lk_api.agent_dispatch.create_dispatch(dispatch_req)
            logger.info(f"Dispatched agent '{agent_name}' to room '{room_name}'")
        except Exception as dispatch_err:
            logger.warning(f"Agent dispatch notice: {dispatch_err}")

        req = CreateSIPParticipantRequest(
            sip_trunk_id=trunk_id,
            sip_call_to=clean_sip_call_to,
            room_name=room_name,
            participant_identity=f"sip_{caller_user_id}",
            participant_name="Linphone User",
            participant_metadata=participant_metadata,
            wait_until_answered=False,
        )

        sip_participant = await lk_api.sip.create_sip_participant(req)
        await lk_api.aclose()

        logger.info(f"Outbound SIP call successfully triggered for room {room_name}")

        return {
            "success": True,
            "room_name": room_name,
            "followup_id": fid_val,
            "destination": target_destination,
            "participant_id": getattr(sip_participant, "participant_id", None),
        }

    except Exception as e:
        logger.error(f"Outbound SIP call failed: {e}")
        if fid_val:
            update_followup_status(fid_val, "failed")
        return {
            "success": False,
            "error": f"SIP call connection failed: {e!s}",
            "followup_id": fid_val,
        }
