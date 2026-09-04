async def test_create_season_returns_201_with_empty_chapters(client, make_user, auth_headers, make_chapter):
    chapter = await make_chapter()
    story_id = chapter.season.story_id
    writer = await make_user("writer-create-season@example.com", role="WRITER")

    response = await client.post(
        "/api/admin/seasons",
        headers=auth_headers(writer),
        json={
            "storyId": str(story_id),
            "index": 2,
            "title": {"ru": "Сезон 2"},
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["chapters"] == []
