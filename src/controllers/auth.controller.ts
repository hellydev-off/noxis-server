import { Request, Response } from "express";
import { AuthService } from "../service/auth.service";

const authService = new AuthService();

export const getUserInfo = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.query;

    const result = await authService.getUserData(user_id);

    res.status(201).json(result);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
