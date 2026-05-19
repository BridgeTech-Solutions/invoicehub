export interface JwtPayload {
  sub:         string;
  email:       string;
  roleId:      string;
  roleName:    string;
  permissions: string[];
  firstName:   string;
  lastName:    string;
}
