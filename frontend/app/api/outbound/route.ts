import { NextResponse } from 'next/server';
import { AgentDispatchClient, SipClient } from 'livekit-server-sdk';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const SIP_TRUNK_ID = process.env.LIVEKIT_SIP_TRUNK_ID;
const LINPHONE_SIP_URI = process.env.LINPHONE_SIP_URI;
const AGENT_NAME = process.env.AGENT_NAME || 'my-agent';

export const revalidate = 0;

export async function POST(req: Request) {
  try {
    if (!LIVEKIT_URL || !API_KEY || !API_SECRET) {
      return NextResponse.json({ error: 'LiveKit server credentials missing' }, { status: 500 });
    }

    const trunkId = SIP_TRUNK_ID;
    if (!trunkId) {
      return NextResponse.json(
        { error: 'LIVEKIT_SIP_TRUNK_ID is not configured' },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const destination =
      body.destination || process.env.OUTBOUND_TEST_DESTINATION || LINPHONE_SIP_URI;

    if (!destination) {
      return NextResponse.json({ error: 'SIP destination URI missing' }, { status: 400 });
    }

    let sipCallTo = destination;
    if (sipCallTo.startsWith('sip:')) {
      sipCallTo = sipCallTo.substring(4);
    }
    if (sipCallTo.includes('@')) {
      sipCallTo = sipCallTo.split('@')[0];
    }

    const userId = body.user_id || 'caller_123';
    const roomName = `outbound-followup-${Date.now()}`;

    const httpUrl = LIVEKIT_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

    const participantMetadata = JSON.stringify({
      is_outbound: true,
      user_id: userId,
      reason: body.reason || 'Follow-up after health consultation',
    });

    // Step 1: Explicitly dispatch agent worker to the room
    try {
      const dispatchClient = new AgentDispatchClient(httpUrl, API_KEY, API_SECRET);
      await dispatchClient.createDispatch(roomName, AGENT_NAME, { metadata: participantMetadata });
      console.log(`[OUTBOUND] Dispatched agent '${AGENT_NAME}' to room '${roomName}'`);
    } catch (dispatchErr) {
      console.warn('[OUTBOUND] Agent dispatch warning:', dispatchErr);
    }

    // Step 2: Create SIP participant to dial Linphone
    const sipClient = new SipClient(httpUrl, API_KEY, API_SECRET);
    const participant = await sipClient.createSipParticipant(trunkId, sipCallTo, roomName, {
      participantIdentity: `sip_${userId}`,
      participantName: 'Linphone User',
      participantMetadata,
      waitUntilAnswered: false,
    });

    return NextResponse.json({
      success: true,
      roomName,
      destination,
      participantId: participant.participantId,
    });
  } catch (error) {
    console.error('Failed to trigger outbound SIP call:', error);
    const msg = error instanceof Error ? error.message : 'Failed to trigger SIP call';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
