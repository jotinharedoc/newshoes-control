import { listEmployeesForLogin } from "@/services/auth.service";


export async function GET() {
  try {
    const employees = await listEmployeesForLogin();

    return Response.json({ employees });
  } catch (error) {
    console.error("Erro ao carregar funcionários:", error);

    return Response.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Não foi possível carregar os funcionários.",
        },
      },
      {
        status: 500,
      },
    );
  }
}