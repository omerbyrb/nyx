FROM python:3.11-slim

RUN apt-get update && apt-get install -y golang-go && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data

EXPOSE 8000 8443
CMD ["python", "run.py", "--host", "0.0.0.0", "--port", "8000"]
