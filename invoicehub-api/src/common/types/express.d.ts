import { JwtPayload } from './jwt-payload.type';

declare global {
  namespace Express {
    interface User extends JwtPayload {}
  }
}
