import { Request } from 'express';
import { InsertExpensifyUser } from 'src/database/schemas/schema';

interface ExpressWithUser extends Request {
  user: InsertExpensifyUser;
}
