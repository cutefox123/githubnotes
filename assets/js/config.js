/* 站点的基本信息都在这儿，想改名字、简介、仓库，只改这个文件即可 */

export const SITE = {
  title: '拾光日记',
  titleEn: 'A PRIVATE DIARY',
  tagline: '把日子过成可以翻的样子。',
  author: 'smnh',
  bio: '住在南方小城。喜欢清晨的雾、旧书店的霉味、冰箱里剩下的半颗柠檬。这里放一些没什么用、但很喜欢的日常。',
  since: 2026,
  repo: {
    owner: 'cutefox123',
    name: 'githubnotes',
    branch: 'main'
  },
  // 加密文件的位置，一般不用改
  paths: {
    lock: 'assets/lock.json',
    index: 'posts/index.json',
    posts: 'posts',
    media: 'media'
  }
};

export const MOODS = ['平静', '自在', '雀跃', '温柔', '疲倦', '想念', '发呆'];
export const WEATHERS = ['晴', '多云', '阴', '小雨', '大雨', '风', '雪', '雾'];
