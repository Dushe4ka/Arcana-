async def test_create_outfit_with_price_and_stat_effects(
    client, make_user, auth_headers, make_story, make_character
):
    writer = await make_user("writer-outfit@example.com", role="WRITER")
    story = await make_story()
    character = await make_character(story, name={"ru": "Маша"})

    response = await client.post(
        f"/api/admin/characters/{character.id}/outfits",
        json={
            "key": "dress",
            "label": {"ru": "Вечернее платье"},
            "priceHard": 150,
            "statEffects": [{"variableKey": "charm", "characterId": None, "op": "INCREMENT", "value": 5}],
        },
        headers=auth_headers(writer),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["priceHard"] == 150
    assert body["statEffects"][0]["variableKey"] == "charm"


async def test_free_outfit_defaults_price_to_zero(
    client, make_user, auth_headers, make_story, make_character
):
    writer = await make_user("writer-outfit-free@example.com", role="WRITER")
    story = await make_story()
    character = await make_character(story, name={"ru": "Маша"})

    response = await client.post(
        f"/api/admin/characters/{character.id}/outfits",
        json={"key": "jeans", "label": {"ru": "Джинсы"}},
        headers=auth_headers(writer),
    )
    assert response.status_code == 201
    assert response.json()["priceHard"] == 0
    assert response.json()["statEffects"] == []


async def test_list_outfits_for_character(client, make_user, auth_headers, make_story, make_character):
    writer = await make_user("writer-outfit-list@example.com", role="WRITER")
    story = await make_story()
    character = await make_character(story, name={"ru": "Маша"})
    await client.post(
        f"/api/admin/characters/{character.id}/outfits",
        json={"key": "jeans", "label": {"ru": "Джинсы"}},
        headers=auth_headers(writer),
    )

    response = await client.get(f"/api/admin/characters/{character.id}/outfits", headers=auth_headers(writer))
    assert response.status_code == 200
    assert len(response.json()) == 1


async def test_update_and_delete_outfit(client, make_user, auth_headers, make_story, make_character):
    writer = await make_user("writer-outfit-update@example.com", role="WRITER")
    story = await make_story()
    character = await make_character(story, name={"ru": "Маша"})
    created = await client.post(
        f"/api/admin/characters/{character.id}/outfits",
        json={"key": "jeans", "label": {"ru": "Джинсы"}},
        headers=auth_headers(writer),
    )
    outfit_id = created.json()["id"]

    updated = await client.patch(
        f"/api/admin/outfits/{outfit_id}", json={"priceHard": 50}, headers=auth_headers(writer)
    )
    assert updated.status_code == 200
    assert updated.json()["priceHard"] == 50

    deleted = await client.delete(f"/api/admin/outfits/{outfit_id}", headers=auth_headers(writer))
    assert deleted.status_code == 204
