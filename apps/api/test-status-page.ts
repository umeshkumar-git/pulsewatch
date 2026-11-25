const response = await fetch(
  "http://localhost:5001/api/v1/status-pages",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: "PulseWatch Service Status",
      monitorIds: [
        "5455978f-c95c-4fb4-837a-dc9e95e0f8b1",
        "a08436d5-d329-47ca-a362-de6b1ccd6f81",
      ],
    }),
  },
);

console.log("HTTP STATUS:", response.status);
console.log("RESPONSE:", await response.text());
