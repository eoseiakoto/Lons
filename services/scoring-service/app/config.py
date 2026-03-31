from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SCORING_")

    app_name: str = "Lons Scoring Service"
    port: int = 8000
    debug: bool = True
    model_version: str = "v1.0-mock"
    model_storage_path: str = "./models"
    psi_threshold: float = 0.25


settings = Settings()
