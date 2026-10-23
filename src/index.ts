import { Hono } from "hono";
import { cors } from 'hono/cors'

type Env = {
  Variables: {
    LASTFM_USERNAME: string;
    LASTFM_API_KEY: string;
  };
};

type AudioScrobblerResponse = {
  recenttracks: {
    track: {
      artist: {
        '#text': string
      },
      album: {
        '#text': string
      },
      name: string,

      image: {
        size: 'small' | 'medium' | 'large' | 'extralarge',
        '#text': string
      }[],

      '@attr'?: {
        nowplaying: string
      },

      url: string
    }[]
  }
}

const app = new Hono<Env>();

const cacheSeconds = 30;

app.use(
  '/api/*',
  cors({
    origin: 'https://amase.cc',
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  })
)

app.get("/api/v1/now_playing", async (c) => {
  const username = c.env?.LASTFM_USERNAME;
  const apiKey = c.env?.LASTFM_API_KEY;

  if (!username || !apiKey) {
    console.error("Missing Last.fm configuration. USERNAME or API_KEY is empty.");
    return c.json({
      error: "Configuration Error",
      message: "Last.fm API key or username is not set in the environment variables."
    }, 500);
  }


  try {
    const resp = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${apiKey}&format=json&limit=1`);

    if (!resp.ok) {
      return c.json({ error: "Failed to fetch from Last.fm" }, 500);
    }

    const respJson = await resp.json() as AudioScrobblerResponse;

    const tracks = respJson.recenttracks?.track;
    if (!tracks || tracks.length === 0) {
      return c.status(204);
    }

    const currentTrack = tracks.find((item) => {
      return (
        item["@attr"] &&
        item["@attr"].nowplaying === "true"
      );
    });

    if (currentTrack) {
      const albumImage = currentTrack.image.find((item) => {
        return (
          item.size && item.size === 'large'
        )
      });

      return c.json({
        name: currentTrack.name,
        artist: currentTrack.artist["#text"],
        album: {
          name: currentTrack.album['#text'],
          image: albumImage?.["#text"] || ""
        },
        url: currentTrack.url
      }, 200, {
        'Cache-Control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`
      });
    }

    return c.status(204);

  } catch (error) {
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

export default app;
