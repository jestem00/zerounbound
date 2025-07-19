FROM python:3.10-slim-bullseye
WORKDIR /app

# Copy requirements file first to leverage Docker layer caching
COPY requirements.txt ./

# Install system build tools required for native extensions (e.g. pysha3, fastecdsa, pyblake2).
# Then upgrade pip, pin wcwidth, and install requirements. After installation,
# purge build tools to reduce image size.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends build-essential \
    && python -m pip install --upgrade pip \
    && pip install --no-cache-dir wcwidth==0.2.6 \
    && pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y build-essential \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY main.py ./
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
