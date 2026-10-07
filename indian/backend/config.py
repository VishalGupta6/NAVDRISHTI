import os

# Live Satellite AIS Stream Configuration
AIS_STREAM_KEY = os.getenv("AIS_STREAM_KEY", "5d9462410d705a8dc3d26964a535e9528290016e")
BOUNDING_BOXES = [
    [[8.0, 60.0], [26.0, 85.0]] # Arabian Sea, Laccadive Sea, Bay of Bengal, Indian EEZ
]

# Free Enterprise Open Data Sources Configuration
GFW_API_URL = os.getenv("GFW_API_URL", "https://api.globalfishingwatch.org/v3")
SENTINEL1_SAR_HUB_URL = os.getenv("SENTINEL1_SAR_HUB_URL", "https://scihub.copernicus.eu/dhus")
OFAC_SANCTIONS_FEED_URL = os.getenv("OFAC_SANCTIONS_FEED_URL", "https://www.treasury.gov/ofac/downloads/sdn.xml")
OPENSANCTIONS_API_URL = os.getenv("OPENSANCTIONS_API_URL", "https://api.opensanctions.org/entities")
EQUASIS_PUBLIC_LOOKUP_URL = os.getenv("EQUASIS_PUBLIC_LOOKUP_URL", "https://www.equasis.org")


