declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        roleId: string;
        roleName: string;
        permissions: string[];
        firstName: string;
        lastName: string;
      };
    }
  }
}

export {};
