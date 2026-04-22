# Run this ONCE to fix existing drivers in MongoDB that have wrong field names
# Command: python fix_old_drivers.py

from database import drivers_col

# Fix old records that used Phone_Number instead of phone
result1 = drivers_col.update_many(
    {"Phone_Number": {"$exists": True}, "phone": {"$exists": False}},
    [{"$set": {"phone": "$Phone_Number"}}]
)
print(f"Fixed Phone_Number → phone: {result1.modified_count} records")

# Fix old records that used licenseNo instead of licence
result2 = drivers_col.update_many(
    {"licenseNo": {"$exists": True}, "licence": {"$exists": False}},
    [{"$set": {"licence": "$licenseNo"}}]
)
print(f"Fixed licenseNo → licence: {result2.modified_count} records")

# Add missing driverId to records that don't have one
drivers = list(drivers_col.find({"driverId": {"$exists": False}}))
for i, d in enumerate(drivers, 1):
    drivers_col.update_one(
        {"_id": d["_id"]},
        {"$set": {"driverId": str(i).zfill(2)}}
    )
print(f"Added driverId to {len(drivers)} records")

# Add missing defaults
drivers_col.update_many(
    {"busNo": {"$exists": False}},
    {"$set": {"busNo": "—"}}
)
drivers_col.update_many(
    {"route": {"$exists": False}},
    {"$set": {"route": "—"}}
)
print("Done! All drivers fixed ✅")