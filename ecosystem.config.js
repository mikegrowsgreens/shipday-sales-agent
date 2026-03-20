module.exports = {
  apps: [
    {
      name: 'saleshub',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
    },
    {
      name: 'voice-agent',
      script: 'npx',
      args: 'tsx src/voice-agent/server.ts',
      env: {
        NODE_ENV: 'production',
        VOICE_AGENT_PORT: 3006,
        VOICE_SSE_PORT: 3007,
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      watch: false,
      // Don't start automatically — requires API keys to be configured
      autorestart: true,
    },
  ],
};
