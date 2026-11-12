"""Big sprites are scaled down on upload, and the reader is told which pictures come next."""

import io

from PIL import Image

from app.engine import runtime
from app.engine.runtime import EngineState, NodeSpec, OptionSpec, StoryGraph
from app.engine.views import build_view
from app.services.uploads_service import MAX_IMAGE_HEIGHT, shrink_image


def _png(width, height, mode="RGBA"):
    out = io.BytesIO()
    Image.new(mode, (width, height), (120, 60, 30, 200) if mode == "RGBA" else (120, 60, 30)).save(out, "PNG")
    return out.getvalue()


def test_tall_sprite_is_scaled_to_phone_height_keeping_format_and_alpha():
    smaller = shrink_image(_png(2000, 4600), "image/png")
    with Image.open(io.BytesIO(smaller)) as image:
        assert image.format == "PNG"
        assert image.mode == "RGBA"
        assert image.size == (round(2000 * MAX_IMAGE_HEIGHT / 4600), MAX_IMAGE_HEIGHT)


def test_small_images_and_landscape_backgrounds_are_left_alone():
    assert shrink_image(_png(800, 1200), "image/png") is None
    assert shrink_image(_png(3840, 2160, "RGB"), "image/png") is None
    assert shrink_image(b"GIF89a....", "image/gif") is None


async def test_upload_keeps_the_original_and_serves_the_smaller_copy(
    client, make_user, auth_headers, tmp_path, monkeypatch
):
    from app.config import settings

    monkeypatch.setattr(settings, "uploads_dir", str(tmp_path))
    writer = await make_user("writer-sprite@example.com", role="WRITER")
    original = _png(2000, 4600)
    response = await client.post(
        "/api/admin/uploads",
        headers=auth_headers(writer),
        files={"file": ("sprite.png", original, "image/png")},
    )
    assert response.status_code == 201
    name = response.json()["url"].rsplit("/", 1)[1]
    assert (tmp_path / "originals" / name).read_bytes() == original
    with Image.open(tmp_path / name) as served:
        assert served.size[1] == MAX_IMAGE_HEIGHT


def _node(node_id, node_type, data, options=()):
    return NodeSpec(
        id=node_id,
        chapter_id="ch",
        type=node_type,
        data=runtime.parse_node_data(node_type, data),
        options=options,
    )


def test_view_lists_pictures_of_the_next_beats_down_every_branch():
    characters = {
        "liv": {"id": "liv", "name": {"ru": "Ливия"}, "nameColor": "#fff", "sprites": {"sad": "s/sad.png"}}
    }
    option = OptionSpec(
        id="o1",
        order=0,
        text={"ru": "a"},
        cost_currency=None,
        cost_amount=0,
        visible_when=(),
        effects=(),
        next_node_id="b",
    )
    graph = StoryGraph(
        nodes={
            "a": _node("a", "DIALOGUE", {"text": {"ru": "1"}, "nextNodeId": "q"}),
            "q": _node("q", "CHOICE", {}, options=(option,)),
            "b": _node(
                "b",
                "DIALOGUE",
                {
                    "text": {"ru": "2"},
                    "backgroundImageUrl": "bg/ruins.jpg",
                    "staged": [{"characterId": "liv", "sprite": "sad", "position": "left"}],
                },
            ),
        },
        variables={},
    )
    view = build_view(graph, runtime.run_until_rest(graph, EngineState(), "a"), characters)
    assert view["preload"] == ["s/sad.png", "bg/ruins.jpg"]
