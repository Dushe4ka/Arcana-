async def test_create_character_with_identity_fields(client, make_user, auth_headers, make_story):
    writer = await make_user("writer-identity@example.com", role="WRITER")
    story = await make_story()
    response = await client.post(
        "/api/admin/characters",
        json={
            "storyId": str(story.id),
            "name": {"ru": "Негодяй"},
            "firstName": "Виктор",
            "lastName": "Соколов",
        },
        headers=auth_headers(writer),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["firstName"] == "Виктор"
    assert body["lastName"] == "Соколов"
    assert body["isProtagonist"] is False


async def test_setting_protagonist_clears_previous_one_in_same_story(
    client, make_user, auth_headers, make_story, make_character
):
    writer = await make_user("writer-protagonist@example.com", role="WRITER")
    story = await make_story()
    first = await make_character(story, name={"ru": "Одри"})
    second = await make_character(story, name={"ru": "Давид"})

    r1 = await client.patch(
        f"/api/admin/characters/{first.id}", json={"isProtagonist": True}, headers=auth_headers(writer)
    )
    assert r1.status_code == 200
    assert r1.json()["isProtagonist"] is True

    r2 = await client.patch(
        f"/api/admin/characters/{second.id}", json={"isProtagonist": True}, headers=auth_headers(writer)
    )
    assert r2.status_code == 200
    assert r2.json()["isProtagonist"] is True

    r1_again = await client.get(f"/api/admin/characters?storyId={story.id}", headers=auth_headers(writer))
    by_id = {c["id"]: c for c in r1_again.json()}
    assert by_id[str(first.id)]["isProtagonist"] is False
    assert by_id[str(second.id)]["isProtagonist"] is True


async def test_protagonist_flag_is_scoped_per_story(
    client, make_user, auth_headers, make_story, make_character
):
    writer = await make_user("writer-protagonist-2@example.com", role="WRITER")
    story_a = await make_story()
    story_b = await make_story()
    hero_a = await make_character(story_a, name={"ru": "Герой А"}, is_protagonist=True)
    hero_b = await make_character(story_b, name={"ru": "Герой Б"})

    response = await client.patch(
        f"/api/admin/characters/{hero_b.id}", json={"isProtagonist": True}, headers=auth_headers(writer)
    )
    assert response.status_code == 200

    refreshed = await client.get(f"/api/admin/characters?storyId={story_a.id}", headers=auth_headers(writer))
    assert refreshed.json()[0]["id"] == str(hero_a.id)
    assert refreshed.json()[0]["isProtagonist"] is True  # untouched by story_b's change
