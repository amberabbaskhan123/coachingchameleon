from __future__ import annotations

import json
import os
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


st.set_page_config(
    page_title="KoMe Ai",
    page_icon="K",
    layout="wide",
    initial_sidebar_state="collapsed",
)

bundle_path = Path(__file__).resolve().parent / "streamlit" / "kome_app_bundle.html"
if not bundle_path.exists():
    st.error(
        "Streamlit bundle missing. Run `npm run build:streamlit-bundle` to generate "
        "`streamlit/kome_app_bundle.html` before deploying."
    )
    st.stop()

bundle_html = bundle_path.read_text(encoding="utf-8")
gemini_key = ""
try:
    gemini_key = st.secrets.get("GEMINI_API_KEY", "")
except Exception:
    gemini_key = ""

if not gemini_key:
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()

bootstrap = (
    "<script>"
    f"window.__KOME_GEMINI_API_KEY__ = {json.dumps(gemini_key)};"
    "</script>"
)

components.html(
    bootstrap + bundle_html,
    height=2200,
    scrolling=True,
)
