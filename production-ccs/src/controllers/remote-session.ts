import { Request, Response } from 'express';
import { logger } from '../utils/logger';

export interface RemoteSessionInfo {
  sessionId: string;
  status: 'active' | 'inactive' | 'connecting' | 'disconnected';
  connectedDevices: number;
  createdAt: Date;
  lastActivity: Date;
}

export interface DeviceInfo {
  deviceId: string;
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'browser';
  userAgent: string;
  capabilities: string[];
}

export class RemoteSessionController {
  private sessions: Map<string, RemoteSessionInfo> = new Map();

  /**
   * Serve remote UI for a specific session
   */
  async serveRemoteUI(req: Request, res: Response): Promise<void> {
    const sessionId = req.params['sessionId'];
    const requestId = (req as any).requestId;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_SESSION_ID',
          message: 'Session ID is required',
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    try {
      // Check if session exists or create a new one
      let session = this.sessions.get(sessionId);
      if (!session) {
        session = {
          sessionId,
          status: 'active',
          connectedDevices: 0,
          createdAt: new Date(),
          lastActivity: new Date(),
        };
        this.sessions.set(sessionId, session);
        logger.info('Created new remote session', { sessionId, requestId });
      }

      // Update last activity
      session.lastActivity = new Date();

      // Serve the remote UI HTML
      const remoteUIHTML = this.generateRemoteUIHTML(sessionId);

      res.setHeader('Content-Type', 'text/html');
      res.status(200).send(remoteUIHTML);

      logger.info('Served remote UI', { sessionId, requestId });
    } catch (error) {
      logger.error('Error serving remote UI', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId,
        requestId,
      });
      throw error;
    }
  }

  /**
   * Get session status
   */
  async getSessionStatus(req: Request, res: Response): Promise<void> {
    const sessionId = req.params['sessionId'];
    const requestId = (req as any).requestId;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_SESSION_ID',
          message: 'Session ID is required',
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    try {
      const session = this.sessions.get(sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session ${sessionId} not found`,
          },
          timestamp: new Date().toISOString(),
          requestId,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          sessionId: session.sessionId,
          status: session.status,
          connectedDevices: session.connectedDevices,
          createdAt: session.createdAt.toISOString(),
          lastActivity: session.lastActivity.toISOString(),
        },
        timestamp: new Date().toISOString(),
        requestId,
      });

      logger.info('Retrieved session status', { sessionId, requestId });
    } catch (error) {
      logger.error('Error getting session status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId,
        requestId,
      });
      throw error;
    }
  }

  /**
   * Connect to remote session
   */
  async connectToSession(req: Request, res: Response): Promise<void> {
    const sessionId = req.params['sessionId'];
    const requestId = (req as any).requestId;
    const deviceInfo: DeviceInfo = req.body.deviceInfo;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_SESSION_ID',
          message: 'Session ID is required',
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    try {
      let session = this.sessions.get(sessionId);

      if (!session) {
        // Create new session if it doesn't exist
        session = {
          sessionId,
          status: 'connecting',
          connectedDevices: 0,
          createdAt: new Date(),
          lastActivity: new Date(),
        };
        this.sessions.set(sessionId, session);
      }

      // Update session
      session.status = 'active';
      session.connectedDevices += 1;
      session.lastActivity = new Date();

      res.status(200).json({
        success: true,
        data: {
          sessionId,
          status: 'connected',
          message: 'Successfully connected to remote session',
          websocketUrl: `ws://localhost:3001/ws/${sessionId}`,
        },
        timestamp: new Date().toISOString(),
        requestId,
      });

      logger.info('Device connected to session', {
        sessionId,
        deviceInfo,
        connectedDevices: session.connectedDevices,
        requestId,
      });
    } catch (error) {
      logger.error('Error connecting to session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId,
        requestId,
      });
      throw error;
    }
  }

  /**
   * Disconnect from remote session
   */
  async disconnectFromSession(req: Request, res: Response): Promise<void> {
    const sessionId = req.params['sessionId'];
    const requestId = (req as any).requestId;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_SESSION_ID',
          message: 'Session ID is required',
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
      return;
    }

    try {
      const session = this.sessions.get(sessionId);

      if (!session) {
        res.status(404).json({
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session ${sessionId} not found`,
          },
          timestamp: new Date().toISOString(),
          requestId,
        });
        return;
      }

      // Update session
      session.connectedDevices = Math.max(0, session.connectedDevices - 1);
      session.lastActivity = new Date();

      if (session.connectedDevices === 0) {
        session.status = 'inactive';
      }

      res.status(200).json({
        success: true,
        data: {
          sessionId,
          status: 'disconnected',
          message: 'Successfully disconnected from remote session',
        },
        timestamp: new Date().toISOString(),
        requestId,
      });

      logger.info('Device disconnected from session', {
        sessionId,
        connectedDevices: session.connectedDevices,
        requestId,
      });
    } catch (error) {
      logger.error('Error disconnecting from session', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId,
        requestId,
      });
      throw error;
    }
  }

  /**
   * Generate remote UI HTML
   */
  private generateRemoteUIHTML(sessionId: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Roo-Code Remote UI - Session ${sessionId}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 2rem;
            max-width: 500px;
            width: 90%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .logo {
            font-size: 2.5rem;
            font-weight: bold;
            margin-bottom: 1rem;
        }
        .session-info {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 1rem;
            margin: 1.5rem 0;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .session-id {
            font-family: 'Courier New', monospace;
            font-size: 1.1rem;
            font-weight: bold;
            color: #ffeb3b;
            margin-bottom: 0.5rem;
        }
        .status {
            display: inline-block;
            padding: 0.3rem 0.8rem;
            background: #4caf50;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: bold;
        }
        .connect-btn {
            background: linear-gradient(45deg, #4caf50, #45a049);
            color: white;
            border: none;
            padding: 1rem 2rem;
            border-radius: 25px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-top: 1rem;
            width: 100%;
        }
        .connect-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(76, 175, 80, 0.4);
        }
        .footer {
            margin-top: 2rem;
            font-size: 0.9rem;
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🦘 Roo-Code</div>
        <h2>Remote UI Interface</h2>
        
        <div class="session-info">
            <div class="session-id">Session: ${sessionId}</div>
            <div class="status" id="status">🟢 Active</div>
        </div>
        
        <button class="connect-btn" onclick="connectToSession()">
            Connect to VSCode Extension
        </button>
        
        <div class="footer">
            <p>Roo-Code Remote UI v1.0.0</p>
            <p>Session established: ${new Date().toLocaleString()}</p>
        </div>
    </div>
    
    <script>
        const sessionId = '${sessionId}';
        let connected = false;
        
        async function connectToSession() {
            const btn = document.querySelector('.connect-btn');
            const status = document.getElementById('status');
            
            try {
                btn.textContent = 'Connecting...';
                btn.disabled = true;
                
                const response = await fetch('/remote/' + sessionId + '/connect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        deviceInfo: {
                            deviceId: 'web_' + Date.now(),
                            deviceType: 'browser',
                            userAgent: navigator.userAgent,
                            capabilities: ['websocket', 'http']
                        }
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    status.innerHTML = '🟢 Connected';
                    btn.textContent = 'Connected Successfully!';
                    connected = true;
                } else {
                    throw new Error(result.error?.message || 'Connection failed');
                }
            } catch (error) {
                console.error('Connection error:', error);
                status.innerHTML = '🔴 Connection Failed';
                btn.textContent = 'Retry Connection';
                btn.disabled = false;
            }
        }
    </script>
</body>
</html>`;
  }
}
