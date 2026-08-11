import argparse
import asyncio
import logging
import sys

from outbound import make_outbound_call

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)


async def main():
    parser = argparse.ArgumentParser(
        description="Trigger Swasthya Sathi Outbound SIP Call via Linphone & LiveKit"
    )
    parser.add_argument(
        "--destination",
        type=str,
        help="SIP URI destination (e.g. sip:mrinal@sip.linphone.org)",
    )
    parser.add_argument(
        "--user-id", type=str, default="caller_123", help="User ID for the follow-up"
    )
    parser.add_argument(
        "--followup-id", type=int, help="Existing follow-up ID in database"
    )
    parser.add_argument(
        "--reason",
        type=str,
        default="Follow-up after health consultation",
        help="Reason for follow-up",
    )

    args = parser.parse_args()

    print("====================================================")
    print("SWASTHYA SATHI - OUTBOUND CALL INITIATOR")
    print("====================================================")
    result = await make_outbound_call(
        followup_id=args.followup_id,
        destination=args.destination,
        user_id=args.user_id,
        reason=args.reason,
    )

    if result.get("success"):
        print("\n[SUCCESS] Outbound SIP Call initiated successfully!")
        print(f"Room Name: {result.get('room_name')}")
        print(f"Destination: {result.get('destination')}")
        print(f"Follow-up ID: {result.get('followup_id')}")
        print("Waiting for Linphone to ring and connect...")
    else:
        print("\n[FAILED] Outbound SIP Call failed!")
        print(f"Error: {result.get('error')}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
