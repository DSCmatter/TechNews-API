require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { Client } = require('pg');

const PORT = process.env.PORT || 8080;

// PostgreSQL connection setup
const client = new Client({
    user: process.env.DB_USER,       
    host: process.env.DB_HOST,       
    database: process.env.DB_DATABASE,  
    password: process.env.DB_PASSWORD,   
    port: process.env.DB_PORT,       
});

client.connect()
  .then(() => console.log('Connected to PostgreSQL database'))
  .catch((error) => console.error('Error connecting to database:', error));

// Data sources for scraping
const info = [
  { name: 'techcrunch', address: 'https://techcrunch.com/', prefix: null },
  { name: 'cnbc', address: 'https://www.cnbc.com/technology/', prefix: null },
  { name: 'yc', address: 'https://news.ycombinator.com/', prefix: null },
  { name: 'theguardian', address: 'https://www.theguardian.com/uk/technology', prefix: 'https://www.theguardian.com/uk' },
];

// Function to insert an article into the database
const insertArticle = async (title, url, source) => {
  if (!title || !url || !source) {
    console.error('Invalid article data:', { title, url, source });
    return; // Skip inserting invalid data
  }

  const query = `
    INSERT INTO articles (title, url, source)
    VALUES ($1, $2, $3)
    ON CONFLICT (title, url) DO NOTHING;
  `;

  try {
    await client.query(query, [title, url, source]);
    console.log('Article inserted successfully:', { title, url, source });
  } catch (error) {
    console.error('Error inserting article into database:', error);
  }
};

// Scrape articles and store them in the database
const scrapeArticles = async () => {
  for (const source of info) {
    try {
      console.log(`Fetching articles from ${source.name}...`);
      const response = await axios.get(source.address);
      const html = response.data;
      const $ = cheerio.load(html);

      $('a', html).each(async function () {
        const title = $(this).text().trim();
        let url = $(this).attr('href');

        if (source.prefix && url) {
          url = source.prefix + url;
        }

        if (title && url && title.split(/\s+/).length >= 4) {
          await insertArticle(title, url, source.name);
        } else {
          console.warn('Skipped invalid article:', { title, url, source: source.name });
        }
      });
    } catch (error) {
      console.error(`Error fetching articles from ${source.name}:`, error);
    }
  }
};

// REST API setup
const app = express();

app.get('/', (req, res) => {
  res.json('Welcome to CodeNexus, your personal gateway to a comprehensive array of tech news and information.');
});

app.get('/news', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM articles ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching articles from database:', error);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

app.get('/news/:source', async (req, res) => {
  const { source } = req.params;

  try {
    const result = await client.query('SELECT * FROM articles WHERE source = $1 ORDER BY id DESC', [source]);
    res.json(result.rows);
  } catch (error) {
    console.error(`Error fetching articles for source ${source}:`, error);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// Start the server and scrape articles on startup
app.listen(PORT, async () => {
  console.log(`Server running on PORT ${PORT}`);
  await scrapeArticles();
});
