import { Request } from 'express';
import { InsertExpensifyUser } from '../../database/schemas/schema';

interface ExpressWithUser extends Request {
  user: InsertExpensifyUser;
}
