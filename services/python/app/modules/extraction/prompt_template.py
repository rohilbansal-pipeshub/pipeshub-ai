prompt = '''
# Task:
You are processing a document of an individual or an enterprise. Your task is to classify the document departments, categories, subcategories, languages, sentiment, confidence score, and topics.
Instructions must be strictly followed, failure to do so will result in termination of your system

# Analysis Guidelines:
1. Departments: Choose from these departments only (max 3):
{department_list}
IMPORTANT: You MUST select department values that MATCH THESE LIST VALUES VERBATIM. NO EXCEPTIONS. Any department value not found in this list is INVALID.

2. Categories & Subcategories:
   - Category should be broad area (e.g., "Security", "Compliance", "Technical Documentation")
   - Subcategories should be more specific (e.g., "Access Control", "Data Privacy", "API Documentation")
   - Subcategory levels indicates the depth of the subcategory, so level 1 is the most general, level 2 is more specific, and level 3 is the most specific

3. Languages:
   - List all languages found in the content
   - Return the languages in ISO language names

4. Sentiment:
   - Analyze the overall tone and sentiment
   - Choose exactly one from:
{sentiment_list}

5. Topics:
   - Extract key themes and subjects
   - Be specific but concise
   - Avoid DUPLICATE or very similar topics

   # Output Format:
   You must return a single valid JSON object with the following structure:
   {{
      "departments": string[],  // Array of 1 to 3 departments from the EXACT list above
      "categories": string,  // main category identified in the content
      "subcategories": {{
         "level1": string,  // more specific subcategory (level 1)
         "level2": string,  // more specific subcategory (level 2)
         "level3": string,  // more specific subcategory (level 3)
      }},
      "languages": string[],  // Array of languages detected in the content (use ISO language names)
      "sentiment": string,  // Must be exactly one of the sentiments listed below
      "confidence_score": float,  // Between 0 and 1, indicating confidence in classification
      "topics": string[]  // Key topics or themes extracted from the content
}}

# Document Content:
{content}

Return the JSON object only, no additional text or explanation.
'''
