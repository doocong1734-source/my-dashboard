import { NextRequest, NextResponse } from 'next/server';
import { google, drive_v3 } from 'googleapis';
import { getDriveAccessToken } from '@/lib/drive-auth';

interface TagInfo {
  tag: string;
  noteIds: string[];
  noteNames: string[];
  frequency: number;
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}

function parseFrontmatterTags(content: string): string[] {
  const tags: string[] = [];
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const frontmatterMatch = content.match(frontmatterRegex);
  
  if (!frontmatterMatch) return tags;
  
  const frontmatter = frontmatterMatch[1];
  
  // Handle tags: [tag1, tag2] or tags: ["tag1", 'tag2']
  const arrayMatch = frontmatter.match(/^tags:\s*\[([^\]]+)\]/m);
  if (arrayMatch) {
    const tagsContent = arrayMatch[1];
    const parsedTags = tagsContent.match(/['"]?([^'"\],]+)['"]?/g);
    if (parsedTags) {
      parsedTags.forEach(t => {
        const cleaned = t.replace(/['"]/g, '').trim();
        if (cleaned) tags.push(cleaned);
      });
    }
  }
  
  // Handle tags: \n  - tag1\n  - tag2 format
  const lines = frontmatter.split('\n');
  let inTagsSection = false;
  let foundArrayFormat = false;
  
  for (const line of lines) {
    if (/^tags:\s*\[/.test(line)) {
      foundArrayFormat = true;
      break;
    }
    if (/^tags:\s*$/.test(line)) {
      inTagsSection = true;
      continue;
    }
    if (inTagsSection) {
      const dashMatch = line.match(/^\s*-\s*(.+)/);
      if (dashMatch) {
        tags.push(dashMatch[1].trim());
      } else if (line.trim() === '' || line.match(/^\s+\w+/)) {
        continue;
      } else {
        break;
      }
    }
  }
  
  if (foundArrayFormat && tags.length === 0) {
    const newArrayMatch = frontmatter.match(/^tags:\s*\[([^\]]+)\]/m);
    if (newArrayMatch) {
      const tagsContent = newArrayMatch[1];
      const parsedTags = tagsContent.match(/['"]?([^'"\],]+)['"]?/g);
      if (parsedTags) {
        parsedTags.forEach(t => {
          const cleaned = t.replace(/['"]/g, '').trim();
          if (cleaned) tags.push(cleaned);
        });
      }
    }
  }
  
  return [...new Set(tags)];
}

function parseInlineHashtags(content: string): string[] {
  const tags: string[] = [];
  const hashtagRegex = /#([a-zA-Z][a-zA-Z0-9_-]*)/g;
  let match;
  
  // Skip hashtags in code blocks
  const codeBlockRegex = /```[\s\S]*?```|`[^`]*`/g;
  let processedContent = content.replace(codeBlockRegex, '');
  
  // Skip frontmatter
  const frontmatterRegex = /^---\n[\s\S]*?\n---\n?/;
  processedContent = processedContent.replace(frontmatterRegex, '');
  
  while ((match = hashtagRegex.exec(processedContent)) !== null) {
    const tag = match[1].toLowerCase();
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  
  return tags;
}

export async function GET(req: NextRequest) {
  const folderId = req.nextUrl.searchParams.get('folderId');
  if (folderId && !/^[a-zA-Z0-9_-]+$/.test(folderId)) {
    return NextResponse.json({ error: 'Invalid folderId' }, { status: 400 });
  }

  const authResult = await getDriveAccessToken(req, ['drive.read']);

  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: authResult.accessToken });

  const drive = google.drive({ version: 'v3', auth });
  const folderFilter = folderId ? `'${folderId}' in parents and ` : '';
  const allFiles: drive_v3.Schema$File[] = [];
  let pageToken: string | null = null;

  do {
    try {
      const response: { data: drive_v3.Schema$FileList } = await drive.files.list({
        q: `${folderFilter}name contains '.md' and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageSize: 100,
        pageToken: pageToken || undefined,
      });
      
      if (response.data.files) {
        allFiles.push(...response.data.files);
      }
      
      pageToken = response.data.nextPageToken || null;
    } catch (error) {
      console.error('Error listing files:', error);
      return NextResponse.json(
        { error: 'Failed to list files from Google Drive' },
        { status: 500 }
      );
    }
  } while (pageToken);
  
  const noteTagMap: Record<string, string[]> = {};
  const tagData: Record<string, { noteIds: Set<string>; noteNames: Map<string, string> }> = {};
  
  for (const file of allFiles) {
    if (!file.id || !file.name) continue;
    
    try {
      const fileResponse = await drive.files.get({
        fileId: file.id,
        alt: 'media',
      }, {
        responseType: 'stream',
      });
      
      const content = await streamToString(fileResponse.data as unknown as NodeJS.ReadableStream);
      
      const frontmatterTags = parseFrontmatterTags(content);
      const inlineTags = parseInlineHashtags(content);
      
      const allTags = [...new Set([...frontmatterTags, ...inlineTags])];
      noteTagMap[file.id] = allTags;
      
      for (const tag of allTags) {
        if (!tagData[tag]) {
          tagData[tag] = {
            noteIds: new Set(),
            noteNames: new Map(),
          };
        }
        tagData[tag].noteIds.add(file.id);
        tagData[tag].noteNames.set(file.id, file.name);
      }
    } catch (error) {
      console.error(`Error fetching file ${file.id}:`, error);
      continue;
    }
  }
  
  const tagIndex: TagInfo[] = Object.entries(tagData).map(([tag, data]) => ({
    tag,
    noteIds: Array.from(data.noteIds),
    noteNames: Array.from(data.noteNames.values()),
    frequency: data.noteIds.size,
  }));
  
  tagIndex.sort((a, b) => b.frequency - a.frequency);
  
  return NextResponse.json({
    tagIndex,
    noteTagMap,
  });
}