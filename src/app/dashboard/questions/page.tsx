import QuestionsPageClient from "./QuestionsPageClient";
import { getTagsWithQuestionCounts } from "@/actions/question.actions";
import { getAllTags } from "@/actions/tag.actions";
import { getUserLocale, t } from "@/i18n/server";
import React from "react";

async function Questions() {
  const [allTagsResult, tagsWithCounts, locale] = await Promise.all([
    getAllTags(),
    getTagsWithQuestionCounts(),
    getUserLocale(),
  ]);

  const allTags = allTagsResult.success ? allTagsResult.data ?? [] : [];

  return (
    <>
      <h1 className="sr-only">{t(locale, "nav.questionBank")}</h1>
      <QuestionsPageClient
        allTags={allTags}
        tagsWithCounts={(tagsWithCounts?.data as any) || []}
        totalQuestions={tagsWithCounts?.total || 0}
      />
    </>
  );
}

export default Questions;
