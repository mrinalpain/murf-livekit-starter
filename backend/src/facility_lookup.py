import json
import logging
import math
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("agent.facility_lookup")


# Earth radius in kilometers for Haversine formula
EARTH_RADIUS_KM = 6371.0


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the Great Circle distance between two points in kilometers."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(EARTH_RADIUS_KM * c, 1)


def geocode_location(location_name: str) -> Optional[tuple[float, float]]:
    """Geocode a city or area name to (lat, lon) using OpenStreetMap Nominatim."""
    try:
        query = urllib.parse.quote(location_name)
        url = (
            f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=1"
        )
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "SwasthyaSathiVoiceAgent/1.0 (healthcare@swasthya-sathi.org)"
            },
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                if data and len(data) > 0:
                    return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        logger.warning(f"Geocoding failed for '{location_name}': {e}")
    return None


def search_google_places(
    query: str,
    api_key: str,
    user_lat: Optional[float] = None,
    user_lon: Optional[float] = None,
    limit: int = 3,
) -> Optional[list[dict[str, Any]]]:
    """Search healthcare facilities using Google Places Text Search API."""
    try:
        encoded_query = urllib.parse.quote(query)
        location_param = (
            f"&location={user_lat},{user_lon}" if user_lat and user_lon else ""
        )
        url = f"https://maps.googleapis.com/maps/api/place/textsearch/json?query={encoded_query}{location_param}&key={api_key}"

        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=8) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                if data.get("status") in ("OK", "ZERO_RESULTS"):
                    results = data.get("results", [])[:limit]
                    facilities = []
                    for item in results:
                        facility_lat = (
                            item.get("geometry", {}).get("location", {}).get("lat")
                        )
                        facility_lon = (
                            item.get("geometry", {}).get("location", {}).get("lng")
                        )

                        distance_km = None
                        if (
                            user_lat is not None
                            and user_lon is not None
                            and facility_lat is not None
                            and facility_lon is not None
                        ):
                            distance_km = haversine_distance(
                                user_lat, user_lon, facility_lat, facility_lon
                            )

                        facilities.append(
                            {
                                "name": item.get("name", "Healthcare Facility"),
                                "type": "Healthcare Facility",
                                "address": item.get(
                                    "formatted_address", "Address unavailable"
                                ),
                                "distance_km": distance_km
                                if distance_km is not None
                                else 1.5,
                            }
                        )
                    return facilities
    except Exception as e:
        logger.error(f"Google Places API error: {e}")
    return None


def search_openstreetmap(
    query_text: str,
    location_name: str,
    user_lat: Optional[float] = None,
    user_lon: Optional[float] = None,
    limit: int = 3,
) -> list[dict[str, Any]]:
    """Search healthcare facilities using OpenStreetMap Nominatim API."""
    facilities: list[dict[str, Any]] = []

    # Prepare search queries
    search_queries = [
        f"{query_text} in {location_name}",
        f"hospital in {location_name}",
        f"health centre in {location_name}",
    ]

    for q in search_queries:
        try:
            encoded_query = urllib.parse.quote(q)
            url = f"https://nominatim.openstreetmap.org/search?q={encoded_query}&format=json&addressdetails=1&limit={limit * 2}"
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "SwasthyaSathiVoiceAgent/1.0 (healthcare@swasthya-sathi.org)"
                },
            )
            with urllib.request.urlopen(req, timeout=6) as response:
                if response.status == 200:
                    results = json.loads(response.read().decode("utf-8"))
                    for res in results:
                        name = (
                            res.get("name") or res.get("display_name", "").split(",")[0]
                        )
                        if not name:
                            continue

                        # Filter or clean name
                        address_obj = res.get("address", {})
                        city = (
                            address_obj.get("city")
                            or address_obj.get("town")
                            or address_obj.get("suburb")
                            or location_name
                        )
                        state = address_obj.get("state", "")
                        address_obj.get("postcode", "")
                        display_addr = res.get(
                            "display_name", f"{name}, {city}, {state}"
                        )

                        fac_lat = float(res.get("lat", 0))
                        fac_lon = float(res.get("lon", 0))

                        dist_km = None
                        if (
                            user_lat is not None
                            and user_lon is not None
                            and fac_lat
                            and fac_lon
                        ):
                            dist_km = haversine_distance(
                                user_lat, user_lon, fac_lat, fac_lon
                            )

                        # Avoid duplicate facility names
                        if not any(
                            f["name"].lower() == name.lower() for f in facilities
                        ):
                            facilities.append(
                                {
                                    "name": name,
                                    "type": "Healthcare Facility",
                                    "address": display_addr,
                                    "distance_km": dist_km
                                    if dist_km is not None
                                    else 2.0,
                                }
                            )

                        if len(facilities) >= limit:
                            break
            if len(facilities) >= limit:
                break
        except Exception as e:
            logger.warning(f"OSM lookup failed for query '{q}': {e}")
            continue

    return facilities[:limit]


def is_facility_api_disabled() -> bool:
    """Check if DISABLE_FACILITY_API=true in os.environ or directly in .env.local file."""
    if os.getenv("DISABLE_FACILITY_API", "").strip().lower() in ("true", "1", "yes"):
        return True

    # Inspect .env.local file directly to catch live updates without requiring agent restart
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_local_path = os.path.join(backend_dir, ".env.local")
    if os.path.exists(env_local_path):
        try:
            with open(env_local_path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("DISABLE_FACILITY_API="):
                        val = (
                            line.split("=", 1)[1].strip().strip('"').strip("'").lower()
                        )
                        if val in ("true", "1", "yes"):
                            return True
        except Exception:
            pass
    return False


def find_nearby_facilities(
    location: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    facility_type: str = "government hospital",
    limit: int = 3,
) -> dict[str, Any]:
    """
    Search nearby healthcare facilities from real map data sources.
    Returns a clean structured JSON response with ISO timestamp.
    """
    if is_facility_api_disabled() or location == "TRIGGER_FAILURE":
        logger.info(
            "Facility lookup failure mode triggered via DISABLE_FACILITY_API flag."
        )
        return {
            "success": False,
            "status": "API_TEMPORARILY_UNAVAILABLE",
            "error": "Healthcare facility lookup is temporarily unavailable.",
            "facilities": [],
            "message": "Healthcare facility lookup is temporarily unavailable. Tell the caller: 'I'm unable to access healthcare facility information right now, so I don't want to give you incorrect information.' Do NOT name any hospital or address.",
        }

    now_iso = datetime.now(timezone.utc).isoformat()

    # 2. Handle missing location
    if not location and (lat is None or lon is None):
        return {
            "success": False,
            "location_required": True,
            "message": "User location is unavailable. Ask the caller for their city or area.",
        }

    loc_label = location or f"{lat:.4f}, {lon:.4f}"
    logger.info(
        f"Looking up facilities: location='{loc_label}', type='{facility_type}', limit={limit}"
    )

    # Resolve coordinates if location string was passed but lat/lon missing
    if (lat is None or lon is None) and location:
        coords = geocode_location(location)
        if coords:
            lat, lon = coords

    google_api_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
    facilities: list[dict[str, Any]] = []
    source = "OpenStreetMap"

    try:
        # Try Google Places API if key is configured
        if google_api_key:
            g_query = f"{facility_type} in {location}" if location else facility_type
            g_results = search_google_places(
                g_query, google_api_key, user_lat=lat, user_lon=lon, limit=limit
            )
            if g_results is not None:
                facilities = g_results
                source = "Google Places"

        # Fallback to OpenStreetMap if Google Places was not used or yielded no results
        if not facilities:
            query_text = facility_type or "government hospital"
            facilities = search_openstreetmap(
                query_text=query_text,
                location_name=location or "India",
                user_lat=lat,
                user_lon=lon,
                limit=limit,
            )
            source = "OpenStreetMap"

        if not facilities:
            return {
                "success": True,
                "source": source,
                "retrieved_at": now_iso,
                "location": loc_label,
                "facilities": [],
                "message": f"No nearby {facility_type} facilities were found.",
            }

        return {
            "success": True,
            "source": source,
            "retrieved_at": now_iso,
            "location": loc_label,
            "facilities": facilities,
        }

    except Exception as e:
        logger.error(f"Facility lookup exception: {e}")
        return {
            "success": False,
            "error": "Healthcare facility lookup is temporarily unavailable.",
        }
