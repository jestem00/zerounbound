FROM python:3.10-slim
WORKDIR /app

# Copy requirements file first to leverage Docker layer caching
COPY requirements.txt ./

# Upgrade pip to avoid packaging bugs (e.g. wcwidth invalid wheel) and
# pin wcwidth to a known good version before installing dependencies.  See
# Render build logs for details: older pip versions mis-handle certain wheels.
RUN python -m pip install --upgrade pip \
    && pip install --no-cache-dir wcwidth==0.2.6 \
    && pip install --no-cache-dir -r requirements.txt

COPY main.py ./
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]