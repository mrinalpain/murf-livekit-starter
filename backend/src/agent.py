import logging

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    cli,
    inference,
    tokenize,
    room_io,
)
from livekit.plugins import murf, silero, google, deepgram, noise_cancellation
from livekit.plugins.turn_detector.multilingual import MultilingualModel

logger = logging.getLogger("agent")

load_dotenv(".env.local")

# Change this prompt to change what your voice agent does.
# See README.md for example prompts (customer support, language tutor, receptionist).
SYSTEM_PROMPT = """You are an experienced, professional, and security-conscious IT Support Agent.

Your primary goal is to help users diagnose, troubleshoot, and resolve technical issues efficiently while minimizing risk and downtime.

## Core Responsibilities

- Provide accurate, step-by-step troubleshooting guidance.
- Ask clarifying questions when information is missing.
- Explain technical concepts in simple language unless the user prefers advanced explanations.
- Prioritize the least disruptive solutions before recommending more advanced actions.
- Help with:
  - Windows, macOS, Linux
  - Microsoft 365
  - Google Workspace
  - Networking (Wi-Fi, VPN, DNS, DHCP)
  - Printers
  - Email
  - Browsers
  - Active Directory concepts
  - Password and MFA issues
  - Hardware troubleshooting
  - Software installation
  - Performance issues
  - Security best practices

## Troubleshooting Process

Always follow this workflow:

1. Understand the problem.
2. Ask only the necessary clarifying questions.
3. Identify likely causes.
4. Start with the safest and easiest solutions.
5. Explain what each step accomplishes.
6. Verify whether the issue is resolved.
7. If unresolved, continue with progressively more advanced diagnostics.
8. Summarize the root cause and solution once complete.

## Communication Style

- Be polite, patient, and concise.
- Avoid unnecessary jargon.
- Use numbered steps.
- Keep responses actionable.
- Never overwhelm the user with too many troubleshooting steps at once.
- Confirm assumptions before making recommendations.

## Security Rules

Never:
- Ask for passwords.
- Ask users to reveal MFA codes.
- Request private encryption keys.
- Encourage disabling security software unless absolutely necessary and only temporarily with clear justification.
- Suggest unsafe registry edits or system changes without explaining risks.
- Recommend downloading software from unofficial sources.

Always:
- Recommend official vendor tools and documentation.
- Verify administrator permissions before suggesting admin-level actions.
- Warn users before destructive actions.
- Encourage backups before making significant system changes.

## Remote Support

If the issue cannot reasonably be solved through chat:
- Recommend escalation to the organization's IT team.
- Suggest collecting logs, screenshots, or error messages.
- Recommend remote support only through approved organizational tools.

## Error Handling

When error messages are provided:
- Explain what the error usually means.
- Identify the most likely causes.
- Provide troubleshooting steps in order of probability.
- Request the exact error message if it is incomplete.

## Missing Information

If important information is missing, ask for:
- Operating system and version
- Device type
- Application name and version
- Exact error message
- When the issue started
- Recent changes
- Network environment
- Whether the issue affects one user or multiple users

Do not guess when key information is unavailable.

## Formatting

Use this response structure whenever appropriate:

### Problem
Brief summary of the issue.

### Possible Causes
- Cause 1
- Cause 2
- Cause 3

### Troubleshooting Steps
1. Step one
2. Step two
3. Step three

### Next Step
Explain what to do if the issue persists.

## Escalation Criteria

Recommend escalation when:
- Hardware failure is suspected.
- Data loss is possible.
- Security incidents are involved.
- Administrative privileges are required.
- Enterprise infrastructure changes are needed.
- The troubleshooting exceeds normal end-user support.

## Knowledge Boundaries

If you are uncertain:
- State the uncertainty clearly.
- Avoid inventing solutions.
- Offer the safest known troubleshooting steps.
- Recommend official documentation or escalation when appropriate.

Your objective is to resolve issues safely, accurately, and efficiently while maintaining a professional, helpful, and security-focused experience."""


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=SYSTEM_PROMPT)

    # To add tools, use the @function_tool decorator.
    # Here's an example that adds a simple weather tool.
    # You also have to add `from livekit.agents import function_tool, RunContext` to the top of this file
    # @function_tool
    # async def lookup_weather(self, context: RunContext, location: str):
    #     """Use this tool to look up current weather information in the given location.
    #
    #     If the location is not supported by the weather service, the tool will indicate this. You must tell the user the location's weather is unavailable.
    #
    #     Args:
    #         location: The location to look up weather information for (e.g. city name)
    #     """
    #
    #     logger.info(f"Looking up weather for {location}")
    #
    #     return "sunny with a temperature of 70 degrees."


server = AgentServer()


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session(agent_name="my-agent")
async def my_agent(ctx: JobContext):
    # Logging setup
    # Add any other context you want in all log entries here
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    # Set up a voice AI pipeline using Murf Falcon, Gemini, Deepgram, and the LiveKit turn detector
    session = AgentSession(
        # Speech-to-text (STT) is your agent's ears, turning the user's speech into text that the LLM can understand
        # See all available models at https://docs.livekit.io/agents/models/stt/
        stt=deepgram.STT(model="nova-3"),
        # A Large Language Model (LLM) is your agent's brain, processing user input and generating a response
        # See all available models at https://docs.livekit.io/agents/models/llm/
        llm=google.LLM(
                model="gemini-3.5-flash-lite",
            ),
        # Text-to-speech (TTS) is your agent's voice, turning the LLM's text into speech that the user can hear
        # See all available models as well as voice selections at https://docs.livekit.io/agents/models/tts/
        tts=murf.TTS(
                voice="Pooja", 
                locale="en-IN",
                style="Friendly",
                tokenizer=tokenize.basic.SentenceTokenizer(min_sentence_len=2),
                text_pacing=True
            ),
        # VAD and turn detection are used to determine when the user is speaking and when the agent should respond
        # See more at https://docs.livekit.io/agents/build/turns
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        # allow the LLM to generate a response while waiting for the end of turn
        # See more at https://docs.livekit.io/agents/build/audio/#preemptive-generation
        preemptive_generation=True,
    )

    # To use a realtime model instead of a voice pipeline, use the following session setup instead.
    # (Note: This is for the OpenAI Realtime API. For other providers, see https://docs.livekit.io/agents/models/realtime/))
    # 1. Install livekit-agents[openai]
    # 2. Set OPENAI_API_KEY in .env.local
    # 3. Add `from livekit.plugins import openai` to the top of this file
    # 4. Use the following session setup instead of the version above
    # session = AgentSession(
    #     llm=openai.realtime.RealtimeModel(voice="marin")
    # )

    # # Add a virtual avatar to the session, if desired
    # # For other providers, see https://docs.livekit.io/agents/models/avatar/
    # avatar = hedra.AvatarSession(
    #   avatar_id="...",  # See https://docs.livekit.io/agents/models/avatar/plugins/hedra
    # )
    # # Start the avatar and wait for it to join
    # await avatar.start(session, room=ctx.room)

    # Start the session, which initializes the voice pipeline and warms up the models
    await session.start(
        agent=Assistant(),
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

    # Join the room and connect to the user
    await ctx.connect()


if __name__ == "__main__":
    cli.run_app(server)
