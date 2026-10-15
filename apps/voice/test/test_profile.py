from fastapi.testclient import TestClient
from app.main import app


def test_profil_kayit_oku(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_DATA_DIR", str(tmp_path))
    c = TestClient(app)
    r = c.put("/profile/ilkaycan", json={"subs": {"cok": "çok", "seker": "şeker"}})
    assert r.status_code == 200
    r2 = c.get("/profile/ilkaycan")
    assert r2.json() == {"subs": {"cok": "çok", "seker": "şeker"}}


def test_failover_cloud_stt_501(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_DATA_DIR", str(tmp_path))
    c = TestClient(app)
    assert c.put("/failover", json={"mode": "cloud"}).status_code == 200
    assert c.get("/failover").json()["mode"] == "cloud"
    assert c.put("/failover", json={"mode": "local"}).status_code == 200
