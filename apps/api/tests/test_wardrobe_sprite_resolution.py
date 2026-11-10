from app.engine.condition_engine import variable_lookup_key
from app.engine.views import resolve_staged
from app.schemas.content import StagedCharacter

CHARACTER = {
    "c1": {
        "id": "c1",
        "name": {"ru": "Ирис"},
        "nameColor": "#fff",
        "sprites": {"dress_neutral": "https://example.test/dress.png", "neutral": "https://example.test/plain.png"},
    }
}
STAGED = [StagedCharacter(character_id="c1", sprite="neutral", position="center")]


def test_resolve_staged_uses_outfit_variable_for_sprite_key():
    values = {variable_lookup_key("outfit", "c1"): "dress"}
    assert resolve_staged(CHARACTER, STAGED, values)[0]["spriteUrl"] == "https://example.test/dress.png"


def test_resolve_staged_falls_back_to_plain_sprite_without_outfit():
    assert resolve_staged(CHARACTER, STAGED, {})[0]["spriteUrl"] == "https://example.test/plain.png"


def test_resolve_staged_falls_back_when_outfit_has_no_sprite_for_this_expression():
    values = {variable_lookup_key("outfit", "c1"): "armor"}
    assert resolve_staged(CHARACTER, STAGED, values)[0]["spriteUrl"] == "https://example.test/plain.png"
