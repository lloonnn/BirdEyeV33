PREFLIGHT = {"Access-Control-Request-Method": "GET"}


def test_preflight_from_dashboard_origin(client):
    response = client.options(
        "/defects?bbox=101.51,3.18,101.52,3.19", headers={**PREFLIGHT, "Origin": "http://localhost:3000"}
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_preflight_from_other_origin_has_no_allow_header(client):
    response = client.options(
        "/defects?bbox=101.51,3.18,101.52,3.19", headers={**PREFLIGHT, "Origin": "http://evil.example"}
    )
    assert "access-control-allow-origin" not in response.headers
