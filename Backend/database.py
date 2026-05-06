from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorCollection

_collection: AsyncIOMotorCollection | None = None
_identify_collection: AsyncIOMotorCollection | None = None


def init_db(mongo_uri: str, db_name: str) -> None:
    from motor.motor_asyncio import AsyncIOMotorClient
    global _collection, _identify_collection
    client = AsyncIOMotorClient(mongo_uri)
    _collection = client[db_name]["summaries"]
    _identify_collection = client[db_name]["identify_links"]


async def db_get(domain: str) -> dict | None:
    return await _collection.find_one({"domain": domain})


async def db_set(domain: str, result: dict, links: list | None = None, content_hash: str | None = None) -> None:
    now = datetime.now(timezone.utc)
    set_fields = {"result": result, "last_updated_at": now}
    if links:
        set_fields["links"] = links
    if content_hash:
        set_fields["content_hash"] = content_hash
    await _collection.update_one(
        {"domain": domain},
        {
            "$set": set_fields,
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )


async def db_get_identify(domain: str) -> dict | None:
    doc = await _identify_collection.find_one({"domain": domain})
    if not doc:
        return None
    return doc.get("result")


async def db_set_identify(domain: str, result: dict) -> None:
    now = datetime.now(timezone.utc)
    await _identify_collection.update_one(
        {"domain": domain},
        {
            "$set": {"result": result, "last_updated_at": now},
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
