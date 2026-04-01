"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { authenticate } from "@/actions/auth.actions";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SigninFormSchema } from "@/models/signinForm.schema";
import Loading from "../Loading";
import { useTranslations } from "@/i18n";

function SigninForm() {
  const { t } = useTranslations();
  const [isPending, startTransition] = useTransition();

  const form = useForm<z.infer<typeof SigninFormSchema>>({
    resolver: zodResolver(SigninFormSchema),
    mode: "onChange",
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const [errorMessage, setError] = useState("");
  const router = useRouter();

  // Defense-in-depth: strip credentials from URL if they leaked via GET fallback
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("email") || url.searchParams.has("password")) {
      url.searchParams.delete("email");
      url.searchParams.delete("password");
      window.history.replaceState({}, "", url.pathname);
    }
  }, []);

  const onSubmit = async (data: z.infer<typeof SigninFormSchema>) => {
    startTransition(async () => {
      setError("");
      const formData = new FormData();
      formData.set("email", data.email);
      formData.set("password", data.password);
      const errorResponse = await authenticate("", formData);
      if (errorResponse) {
        setError(errorResponse);
      } else {
        router.push("/dashboard");
      }
    });
  };

  return (
    <>
      <Form {...form}>
        <form
          method="POST"
          action=""
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <div className="grid gap-4">
            <div className="grid gap-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="email">{t("auth.email")}</FormLabel>
                    <FormControl>
                      <Input
                        id="email"
                        placeholder={t("auth.emailPlaceholder")}
                        autoComplete="email"
                        suppressHydrationWarning
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-2">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="password">{t("auth.password")}</FormLabel>
                    <FormControl>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        suppressHydrationWarning
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? <Loading /> : t("auth.login")}
            </Button>
            <div
              className="flex h-8 items-end space-x-1"
              aria-live="polite"
              aria-atomic="true"
            >
              {errorMessage && (
                <>
                  <p className="text-sm text-red-500">{errorMessage}</p>
                </>
              )}
            </div>
          </div>
        </form>
      </Form>
    </>
  );
}

export default SigninForm;
