"""Exercise model discovery through the disposable local Worker, without inference."""
import json
import sys
import urllib.parse
import urllib.request


def main():
    base = sys.argv[1]
    target = urllib.parse.urlsplit(base)
    assert target.scheme == "http" and target.hostname == "127.0.0.1" and target.port
    assert not target.username and not target.path and not target.query and not target.fragment

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    client = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def get(path):
        with client.open(base + path, timeout=10) as response:
            assert response.status == 200
            return response.read().decode()

    references = {"gemma4_e2b_reference", "liquid24_reference", "embeddinggemma2_reference"}
    for experience, first, size in (
        ("text_assistant", "liquid12", 730895168),
        ("transcription", "fluid_speech_mini", 252881615),
        ("semantic_search", "embeddinggemma300", 333590944),
        ("decision_classification", "d1_omni600", 669998816),
    ):
        query = urllib.parse.urlencode({"experience": experience, "device": "iPhone15,3", "ios": 26})
        result = json.loads(get("/api/models/suggest?" + query))
        assert result["catalog_as_of"] == "2026-10-22"
        assert result["selection"] is None
        assert result["candidates"][0]["id"] == first
        assert result["candidates"][0]["download_bytes"] == size
        assert references.isdisjoint(row["id"] for row in result["candidates"])
        assert all(not row["qualified"] and row["memory_fit"] == "unknown" for row in result["candidates"])
        if experience != "text_assistant":
            assert result["trial_order"] == []
            assert all(row["status"] == "requires_runtime_integration" for row in result["candidates"])
        else:
            assert result["trial_order"][0] == first
        page = get("/models?" + query)
        assert "Start with text, voice notes and search" in page
        assert "no configuration here is production-qualified" in page
        assert "Mac comparison models" in page
        assert result["candidates"][0]["name"] in page
        assert "SHA-256:" in page
    shopping = json.loads(get("/api/models/suggest?device=iPhone15%2C3&ios=26&experience=shopping_filters"))
    assert {"liquid350", "qwen08"}.isdisjoint(shopping["trial_order"])
    print("Model discovery HTTP E2E passed: text, voice notes, search, decisions and qualification gates")


if __name__ == "__main__":
    main()
