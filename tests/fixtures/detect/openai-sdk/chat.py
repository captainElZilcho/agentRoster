from openai import OpenAI

client = OpenAI()

def chat(text):
    reply = client.chat.completions.create(model="m", messages=[])
    return client.responses.create(model="m", input=text)
