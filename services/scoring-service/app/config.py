from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Lons Scoring Service"
    port: int = 8000
    debug: bool = True
    model_version: str = "v1.0-mock"

    class Config:
        env_prefix = "SCORING_"


settings = Settings()
