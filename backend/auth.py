import json
import os
from typing import Any, Dict

import firebase_admin
from fastapi import Depends, Header, HTTPException
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials
from dotenv import load_dotenv

load_dotenv()
LOG_MISSING_AUTH = os.getenv("LOG_MISSING_AUTH", "false").lower() == "true"


def _init_firebase_admin() -> None:
    if firebase_admin._apps:
        return

    service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    credentials_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "").strip()
    google_app_creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    project_id = (
        os.getenv("FIREBASE_PROJECT_ID", "").strip()
        or os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
    )
    options = {"projectId": project_id} if project_id else None

    cred = None
    if service_account_json:
        try:
            cred_dict = json.loads(service_account_json)
            cred = credentials.Certificate(cred_dict)
        except Exception as exc:
            print(f"AuthError: Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: {exc}")

    if not cred and credentials_path:
        try:
            cred = credentials.Certificate(credentials_path)
        except Exception as exc:
            print(f"AuthError: Failed to load credentials from {credentials_path}: {exc}")

    if cred:
        if options:
            firebase_admin.initialize_app(cred, options=options)
        else:
            firebase_admin.initialize_app(cred)
    elif google_app_creds:
        if options:
            firebase_admin.initialize_app(options=options)
        else:
            firebase_admin.initialize_app()
    else:
        raise RuntimeError(
            "Missing Firebase Admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON, "
            "FIREBASE_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS."
        )


def verify_firebase_token(authorization: str | None = Header(default=None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        if LOG_MISSING_AUTH:
            print("AuthError: Missing or invalid Authorization header")
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        if LOG_MISSING_AUTH:
            print("AuthError: Missing bearer token")
        raise HTTPException(status_code=401, detail="Missing bearer token.")

    try:
        _init_firebase_admin()
    except Exception as exc:
        print(f"AuthError: Firebase Admin setup failed: {exc}")
        raise HTTPException(
            status_code=503,
            detail=f"Firebase Admin is not configured: {exc}",
        ) from exc

    try:
        decoded_token = firebase_auth.verify_id_token(token)
        return decoded_token
    except Exception as exc:
        if "default credentials were not found" in str(exc).lower():
            print(f"AuthError: Firebase Admin credentials missing: {exc}")
            raise HTTPException(
                status_code=503,
                detail=(
                    "Firebase Admin credentials not configured. "
                    "Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CREDENTIALS_PATH."
                ),
            ) from exc
        print(f"AuthError: Invalid Firebase token: {exc}")
        raise HTTPException(status_code=401, detail=f"Invalid Firebase token: {exc}") from exc


AuthenticatedUser = Depends(verify_firebase_token)
