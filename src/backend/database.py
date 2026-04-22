from pymongo import MongoClient

# MongoDB Atlas Connection (same DB as admin)
MONGO_URL = "mongodb+srv://bus_tracking:bus_tracking@cluster0.hlpjt9m.mongodb.net/bus?retryWrites=true&w=majority"

client = MongoClient(MONGO_URL)
db = client["bus"]

# === Collections (shared with admin) ===
drivers_col    = db["drivers"]      # driver accounts + assigned route/bus
students_col   = db["students"]     # students with route field
buses_col      = db["buses"]
routes_col     = db["routes"]
locations_col  = db["locations"]    # live GPS updates
boarding_col   = db["boarding"]     # board-in / board-out records
trips_col      = db["trips"]        # trip summary

print("✅ Connected to MongoDB Atlas (bus database)")