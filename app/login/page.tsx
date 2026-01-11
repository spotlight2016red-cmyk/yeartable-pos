import { signIn, signUp } from "./actions";

type Props = {
  searchParams?: { signup?: string };
};

export default function LoginPage({ searchParams }: Props) {
  const isSignUp = searchParams?.signup === "1";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-sm dark:bg-zinc-900">
        <h1 className="mb-6 text-2xl font-semibold text-black dark:text-zinc-50">
          {isSignUp ? "新規登録" : "ログイン"}
        </h1>

        <form action={isSignUp ? signUp : signIn} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              メールアドレス
            </label>
            <input
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              パスワード
            </label>
            <input
              name="password"
              type="password"
              required
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-black px-4 py-2 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
          >
            {isSignUp ? "新規登録" : "ログイン"}
          </button>
        </form>

        <div className="mt-4 text-center">
          {isSignUp ? (
            <a
              href="/login"
              className="text-sm text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              既にアカウントをお持ちですか？
            </a>
          ) : (
            <a
              href="/login?signup=1"
              className="text-sm text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              新規登録はこちら
            </a>
          )}
        </div>
      </div>
    </div>
  );
}














