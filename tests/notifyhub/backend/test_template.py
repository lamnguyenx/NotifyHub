"""Production template transformation tests."""

from notifyhub.backend import backend


def test_template_injects_production_script_and_stylesheet():
    html = backend.load_and_transform_template()

    assert "/src/main.tsx" not in html
    assert "/static/app.js" in html
    # The stylesheet injection must not depend on a Bootstrap placeholder.
    assert "/static/main.css" in html
    assert html.index("/static/main.css") < html.index("</head>")


def test_template_does_not_duplicate_stylesheet():
    html = backend.load_and_transform_template()

    assert html.count("/static/main.css") == 1
