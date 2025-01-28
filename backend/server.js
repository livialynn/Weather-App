const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const { Parser } = require("json2csv");
const xml = require("xml");
require("dotenv").config();
const mysql = require("mysql2/promise");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(bodyParser.json());
app.use(cors());

// MySQL connection setup
const dbConfig = new URL(process.env.DATABASE_URL);
const pool = mysql.createPool({
  host: dbConfig.hostname,
  user: dbConfig.username,
  password: dbConfig.password,
  database: "weather_app",
  port: dbConfig.port || 3306,
});

let weatherData = [];

// Helper function to generate forecasts
const generateForecast = (baseTemp) => {
  return Array(5)
    .fill()
    .map((_, i) => ({
      date: new Date(
        new Date().setDate(new Date().getDate() + i)
      ).toLocaleDateString(),
      icon: "http://openweathermap.org/img/wn/01d@2x.png",
      temp: baseTemp + i,
    }));
};

app.post("/api/weather", async (req, res) => {
  const { location, startDate, endDate } = req.body;

  try {
    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${location}&units=metric&appid=${process.env.WEATHER_API_KEY}`;
    const response = await axios.get(apiUrl);
    const data = response.data;

    const weather = {
      id: uuidv4(),
      location: data.name,
      temperature: data.main.temp,
      condition: data.weather[0].description,
      //dateRange: startDate && endDate ? generateForecast(data.main.temp) : [],
      forecast: generateForecast(data.main.temp),
    };

    weatherData = [weather]; // Only store the current result
    res.status(201).json(weather);
  } catch (error) {
    console.error("Error fetching weather data:", error.message);
    res.status(500).json({ message: "Failed to fetch weather data." });
  }
});

app.get("/api/weather/location", async (req, res) => {
  const { latitude, longitude } = req.query;

  try {
    const apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${process.env.WEATHER_API_KEY}`;
    const response = await axios.get(apiUrl);
    const data = response.data;

    const weather = {
      id: uuidv4(),
      location: data.name,
      temperature: data.main.temp,
      condition: data.weather[0].description,
      dateRange: [],
      forecast: generateForecast(data.main.temp),
    };

    weatherData = [weather]; // Only store the current result
    res.status(200).json(weather);
  } catch (error) {
    console.error("Error fetching weather data by location:", error.message);
    res.status(500).json({ message: "Failed to fetch weather data." });
  }
});

app.get("/api/weather/export/:format", (req, res) => {
  const { format } = req.params;

  if (format === "json") {
    res.json(weatherData);
  } else if (format === "csv") {
    const parser = new Parser();
    const csv = parser.parse(weatherData);
    res.header("Content-Type", "text/csv").send(csv);
  } else if (format === "xml") {
    res.header("Content-Type", "application/xml").send(xml({ weatherData }));
  } else {
    res.status(400).send("Invalid export format");
  }
});

// UPDATE: Update weather records in MySQL
app.put("/api/weather/:id", async (req, res) => {
  const { id } = req.params;
  const { temperature } = req.body;

  try {
    const query = "UPDATE weather_data SET temperature = ? WHERE id = ?";
    const [result] = await pool.query(query, [temperature, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Weather record not found." });
    }

    res.json({ message: "Weather record updated successfully." });
  } catch (error) {
    console.error("Error updating weather record:", error.message);
    res.status(500).json({ message: "Failed to update weather record." });
  }
});

// DELETE: Delete weather records from MySQL
app.delete("/api/weather/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const query = "DELETE FROM weather_data WHERE id = ?";
    const [result] = await pool.query(query, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Weather record not found." });
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting weather record:", error.message);
    res.status(500).json({ message: "Failed to delete weather record." });
  }
});

// EXPORT: Export data in JSON, CSV, or XML format
app.get("/api/weather/export/:format", async (req, res) => {
  const { format } = req.params;

  try {
    const [rows] = await pool.query("SELECT * FROM weather_data");

    if (format === "json") {
      res.json(rows);
    } else if (format === "csv") {
      const parser = new Parser();
      const csv = parser.parse(rows);
      res.header("Content-Type", "text/csv").send(csv);
    } else if (format === "xml") {
      res
        .header("Content-Type", "application/xml")
        .send(xml({ records: rows }));
    } else {
      res.status(400).send("Invalid export format");
    }
  } catch (error) {
    console.error("Error exporting weather data:", error.message);
    res.status(500).json({ message: "Failed to export weather data." });
  }
});

app.listen(process.env.PORT || 5001, () => {
  console.log(`Server running on port ${process.env.PORT || 5001}`);
});
