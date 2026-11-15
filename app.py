import io
import os
from typing import List, Literal
from google import genai
from google.genai import types
from PIL import Image
import pdfplumber
from pydantic import BaseModel, Field
import streamlit as st

# --- Page Config ---
st.set_page_config(
    page_title="Bam Bam Bole Masti me Dole | AI Red-Flag Scanner",
    page_icon="🕵️",
    layout="wide",
    
)
# --- Custom CSS: Pointer cursor on selectbox & non-scrollable sidebar ---
st.markdown(
    """
    <style>
    div[data-testid="stSelectbox"],
    div[data-testid="stSelectbox"] * {
        cursor: pointer !important;
    }
    section[data-testid="stSidebar"] > div,
    div[data-testid="stSidebarContent"],
    div[data-testid="stSidebarUserContent"] {
        overflow-y: hidden !important;
    }
    div[data-testid="stSidebarUserContent"] {
        padding-top: 1.5rem !important;
        padding-bottom: 1rem !important;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


# --- Structured Output Schema ---
class RedFlag(BaseModel):
  clause_quote: str = Field(
      description="Exact short quote or summary of the risky clause"
  )
  severity: Literal["High", "Medium", "Low"] = Field(description="Risk level")
  category: str = Field(
      description=(
          "Category like Hidden Fees, Privacy Trap, Auto-Renewal, Unfair"
          " Liability, etc."
      )
  )
  plain_english: str = Field(
      description="Simple explanation of why this is bad for the user"
  )


class ScanReport(BaseModel):
  safety_score: int = Field(
      description=(
          "Safety Trust Score from 0 (total scam/trap) to 100 (completely safe)"
      )
  )
  verdict: str = Field(
      description="Short 3-5 word overall verdict (e.g., 'Proceed with Caution')"
  )
  summary: str = Field(
      description="2-3 sentence plain-English summary of what this document is"
  )
  red_flags: List[RedFlag] = Field(
      description="List of shady, unfair, or hidden clauses found"
  )
  good_points: List[str] = Field(
      description="Fair or protective clauses found in the document"
  )


# --- Sample Contracts for Live Demo ---
SAMPLES = {
    "Select a sample trap...": "",
    "Sketchy Free App Terms": (
        "By installing FreeWallpaperz, you grant us a perpetual, irrevocable"
        " license to access, sell, and distribute your contacts, photos, and"
        " GPS location to third-party data brokers. Your 3-day free trial"
        " automatically converts into a ₹4,999/week non-refundable"
        " subscription unless canceled via certified physical mail sent to our"
        " office at least 30 days prior."
    ),
    "Predatory Hostel/PG Agreement": (
        "Tenant agrees to pay a security deposit of ₹50,000, which shall be"
        " forfeited in full if the tenant vacates before 24 months for any"
        " reason, including medical emergencies. Landlord reserves the right to"
        " enter the room without notice and increase monthly rent by up to 25%"
        " at any time with 24 hours verbal notice."
    ),
    "Fair School Event Permission Slip": (
        "I give permission for my child to attend the Inter-School Science"
        " Exhibition on November 28. School staff will supervise all students"
        " during transit. Emergency contact details will only be used by"
        " medical personnel if needed and will be deleted after the event."
    ),
}

# --- Sidebar: Lens & Info (API Key stays completely hidden) ---
with st.sidebar:
  st.title("🕵️ DocSleuth")
  st.caption("Spot hidden traps before you agree.")

  # Load key silently from .streamlit/secrets.toml or environment variable
  api_key = ""
  try:
    api_key = st.secrets["GEMINI_API_KEY"]
  except Exception:
    api_key = os.environ.get("GEMINI_API_KEY", "")

  lens = st.selectbox(
      "Analysis Lens",
      [
          "General Consumer & Student",
          "App Terms & Privacy Policy",
          "Rental / Lease Agreement",
          "Employment / Internship Offer",
      ],
  )

  st.divider()
  st.markdown("**How it works:**")
  st.markdown(
      "1. Upload a **PDF**, **Screenshot**, or **Paste Text**.\n2. AI scans"
      " for hidden fees, data traps, and unfair rules.\n3. Get a **Safety"
      " Trust Score** and plain-English breakdown."
  )

# --- Main Header ---
st.title("Spot hidden traps and legal red flags before you agree.")
st.write(
    "Upload any PDF contract, terms of service, or screenshot—or test with a"
    " sample below."
)

# --- Input Section ---
tab_upload, tab_paste = st.tabs(["📄 Upload PDF or Image", "✍️ Paste Text"])

extracted_text = ""
uploaded_image = None

with tab_upload:
  uploaded_file = st.file_uploader(
      "Choose a PDF or Image (PNG, JPG, WEBP)",
      type=["pdf", "png", "jpg", "jpeg", "webp"],
  )
  if uploaded_file is not None:
    if uploaded_file.type == "application/pdf":
      with pdfplumber.open(uploaded_file) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
        extracted_text = "\n".join(pages).strip()
      if extracted_text:
        st.success(f"Extracted {len(extracted_text)} characters from PDF.")
        with st.expander("Preview extracted PDF text"):
          st.text(
              extracted_text[:2000]
              + ("..." if len(extracted_text) > 2000 else "")
          )
      else:
        st.warning(
            "This PDF looks like a scanned image with no selectable text. Try"
            " uploading a screenshot of the page instead!"
        )
    else:
      uploaded_image = Image.open(uploaded_file)
      st.image(uploaded_image, caption="Uploaded Document Image", width=400)

with tab_paste:
  sample_choice = st.selectbox(
      "Quick-load a demo example:", list(SAMPLES.keys())
  )
  pasted_text = st.text_area(
      "Or paste any contract, terms & conditions, or suspicious message here:",
      value=SAMPLES[sample_choice],
      height=180,
      placeholder="Paste fine print here...",
  )
  if pasted_text.strip():
    extracted_text = pasted_text.strip()

# --- Analyze Button & Gemini Call ---
if st.button("🔍 Scan for Red Flags", type="primary", use_container_width=True):
  if not api_key:
    st.error("Enter your Gemini API Key in the left sidebar first!")
  elif not extracted_text and uploaded_image is None:
    st.warning("Upload a PDF/image or paste some text to scan.")
  else:
    with st.spinner("DocSleuth is reading the fine print..."):
      try:
        client = genai.Client(api_key=api_key)

        system_prompt = (
            f"You are DocSleuth, an expert consumer-protection AI analyzing"
            f" documents through a '{lens}' lens. Detect predatory clauses,"
            " hidden fees, automatic renewals, privacy violations, waiver of"
            " rights, and unfair penalties. Explain everything in clear, sharp,"
            " everyday English that a middle-school student or regular consumer"
            " can immediately understand. Be strict on hidden traps."
        )

        contents = []
        if uploaded_image is not None:
          contents.append(uploaded_image)
          contents.append(
              "Analyze this document image for hidden traps, red flags, and"
              " fairness."
          )
        else:
          contents.append(
              f"Analyze this document text for hidden traps, red flags, and"
              f" fairness:\n\n{extracted_text}"
          )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_schema=ScanReport,
                temperature=0.2,
            ),
        )

        report = ScanReport.model_validate_json(response.text)

        # --- Display Results ---
        st.divider()
        col1, col2 = st.columns([1, 2])

        with col1:
          score = max(0, min(100, report.safety_score))
          st.metric(label="Safety Trust Score", value=f"{score} / 100")
          if score >= 75:
            st.success(f"**Verdict:** {report.verdict}")
          elif score >= 45:
            st.warning(f"**Verdict:** {report.verdict}")
          else:
            st.error(f"**Verdict:** {report.verdict}")

        with col2:
          st.subheader("Plain-English Summary")
          st.write(report.summary)

        # Red Flags Section
        st.subheader(f"🚩 Red Flags Detected ({len(report.red_flags)})")
        if not report.red_flags:
          st.info("No major shady clauses or red flags found!")
        else:
          for flag in report.red_flags:
            badge = (
                "🔴"
                if flag.severity == "High"
                else ("🟠" if flag.severity == "Medium" else "🟡")
            )
            with st.expander(
                f"{badge} [{flag.severity.upper()}] {flag.category} —"
                f" {flag.plain_english[:70]}...",
                expanded=True,
            ):
              st.markdown(f"**Why it's risky:** {flag.plain_english}")
              st.caption(f'Clause in document: "{flag.clause_quote}"')

        # Fair / Good Points Section
        if report.good_points:
          st.subheader("✅ Fair / Safe Clauses")
          for point in report.good_points:
            st.markdown(f"- {point}")

      except Exception as e:
        st.error(f"Scan failed: {e}")