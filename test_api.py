import requests

# API endpoint
url = "https://y4t9nq2bqf.execute-api.eu-west-2.amazonaws.com/v1/candles/GOOGL"

# API key header
headers = {
    "X-Api-Key": "fnx_dev_CvXEv1ohuj4MUkfZjn0kmyDFguxcvofA"
}
response = requests.get(url, headers=headers)

# Check response status
print(response.status_code)
print(response.json())
