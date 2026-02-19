import { AppDataSource } from "../config/db";
import { User } from "../entities/User";

export class AuthService {
  private userRepository = AppDataSource.getRepository(User);

  async register(
    user_id: number,
    first_name: string,
    language_code: string,
    username: string,
  ) {
    const existing = await this.userRepository.findOneBy({ user_id });
    if (existing) throw new Error("User already exists");

    const user = this.userRepository.create({
      user_id: user_id,
      first_name: first_name,
      language_code: language_code,
      username: username,
    });
    return await this.userRepository.save(user);
  }

  async getUserData(user_id: number) {
    const user = await this.userRepository.findOne({
      where: { user_id },
      select: [
        "id",
        "user_id",
        "first_name",
        "language_code",
        "username",
        "inventory",
        "activeSkin",
      ],
    });

    if (!user) throw new Error("User not found");

    return {
      user: {
        user_id: user_id,
        first_name: user.first_name,
        language_code: user.language_code,
        username: user.username,
        inventory: user.inventory,
        activeSkin: user.activeSkin,
      },
    };
  }

  async login(user_id: number, pass: string) {
    const user = await this.userRepository.findOne({
      where: { user_id },
      select: ["id", "user_id", "first_name", "language_code", "username"],
    });

    if (!user) throw new Error("User not found");

    return {
      user: {
        user_id: user_id,
        first_name: user.first_name,
        language_code: user.language_code,
        username: user.username,
      },
    };
  }
}
