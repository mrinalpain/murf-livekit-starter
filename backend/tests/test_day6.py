import pytest
from livekit.agents import AgentSession, inference, llm

from agent import Assistant
from db import (
    cancel_user_followups,
    create_followup,
    get_followup,
    get_pending_followups,
    init_db,
)


def _llm() -> llm.LLM:
    return inference.LLM(model="openai/gpt-4.1-mini")


@pytest.fixture(autouse=True)
def setup_database():
    init_db()


def test_db_followup_operations():
    """Test SQLite follow_ups table creation, reading, and opt-out cancellation."""
    user_id = "test_user_day6"

    # 1. Create follow-up
    fid = create_followup(
        user_id=user_id,
        phone_number="sip:test@sip.linphone.org",
        reason="Follow-up after leg pain",
        scheduled_at="Tomorrow at 10 AM",
        consent=True,
    )
    assert fid is not None

    record = get_followup(fid)
    assert record is not None
    assert record["user_id"] == user_id
    assert record["status"] == "scheduled"
    assert record["consent"] == 1

    # 2. Verify in pending list
    pending = get_pending_followups()
    assert any(p["id"] == fid for p in pending)

    # 3. Test Opt-out cancellation
    cancel_success = cancel_user_followups(user_id)
    assert cancel_success is True

    updated_record = get_followup(fid)
    assert updated_record["status"] == "cancelled"
    assert updated_record["consent"] == 0


@pytest.mark.asyncio
async def test_outbound_greeting_eval():
    """Evaluation of the outbound agent greeting flow."""
    instructions = (
        "You are Swasthya Sathi.\n"
        "CURRENT SESSION IS AN OUTBOUND CALL.\n"
        "Start IMMEDIATELY with the mandatory four-part outbound greeting:\n"
        "1. Who is calling ('Namaste, this is Swasthya Sathi, your healthcare voice assistant.')\n"
        "2. Why calling ('I'm calling to follow up on the health concern we discussed earlier.')\n"
        "3. How to stop future calls ('If you don't want to receive these follow-up calls, just tell me and I'll stop.')\n"
        "4. Ask: 'Is this a good time to talk?'"
    )

    async with (
        _llm() as llm,
        AgentSession(llm=llm) as session,
    ):
        await session.start(Assistant(instructions=instructions))

        # Run an agent turn following call connection
        result = await session.run(user_input="[Phone answered]")

        event = result.expect.next_event()
        if hasattr(event, "type") and event.type == "function_call":
            result.expect.next_event().is_function_call_output()
            event = result.expect.next_event()

        # Judge agent's outbound greeting
        await event.is_message(role="assistant").judge(
            llm,
            intent="""
                Delivers an outbound greeting that:
                1. Identifies itself as Swasthya Sathi, healthcare voice assistant
                2. Explains the purpose of the call (following up on previous health concern)
                3. Mentions how to stop future calls or opt out
                4. Asks if this is a good time to talk
                """,
        )
