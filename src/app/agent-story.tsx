'use client';

import Image, { type StaticImageData } from 'next/image';
import { Bot, Paperclip } from 'lucide-react';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useReveal } from './use-reveal';
import offersArt from '@public/scenes/scene-1-offers.webp';
import weighingArt from '@public/scenes/scene-2-living.webp';
import targetArt from '@public/scenes/scene-3-answer.webp';
import replyArt from '@public/scenes/scene-4-decision.webp';

type Message = { from: 'user' | 'agent'; text: string; files?: string[] };
type Scene = { time: string; label: string; messages: Message[]; art: StaticImageData };

// 가상 사용자 윤하늘(25세, 대구 달서구 본가, 기계설계 신입)의 상담. 회사·사람은 모두 가상이다.
// 숫자는 아래 비교표(compare-view.tsx의 rows)와 같은 값을 쓴다.
const scenes: Scene[] = [
  {
    time: '09:12',
    label: '합격 두 곳',
    art: offersArt,
    messages: [
      {
        from: 'user',
        text: '둘 다 합격했어. 서울은 3,800만원, 대구는 처우 협의래. 대구는 얼마면 비슷하게 남을까?',
        files: ['합격안내_한빛모빌리티.png', '채용공고_달구벌정밀.pdf'],
      },
      {
        from: 'agent',
        text: '공고를 읽었어요. 대구는 통근버스가 무료고, 연봉은 공고에 없어서 비워 뒀어요.',
      },
    ],
  },
  {
    time: '09:14',
    label: '생활비 확인',
    art: weighingArt,
    messages: [
      {
        from: 'agent',
        text: '본가에 매달 드리는 돈과 지역별 생활비는 얼마쯤일까요?',
      },
      {
        from: 'user',
        text: '본가엔 30만원 드려. 생활비는 대구 70만원, 서울 100만원쯤이야.',
      },
    ],
  },
  {
    time: '09:15',
    label: '최소 연봉',
    art: targetArt,
    messages: [
      {
        from: 'agent',
        text: '대구 연봉이 약 2,700만원 이상이면 서울만큼 매달 약 119만원이 남아요. 서울은 월세 50만원이 크게 빠져요.',
      },
      {
        from: 'agent',
        text: '통근버스가 없으면 약 2,800만원은 돼야 해요. 협의 때 확인해 보세요.',
      },
    ],
  },
  {
    time: '일주일 뒤',
    label: '최종 선택',
    art: replyArt,
    messages: [
      {
        from: 'user',
        text: '이 금액 기준으로 희망 연봉 말했어. 연봉만 봤으면 서울로 갔을 거야.',
      },
      {
        from: 'agent',
        text: '생활비가 예상과 달라지면 알려 주세요. 다시 계산해 드릴게요.',
      },
    ],
  },
];

export function AgentStory() {
  const [ref, reveal] = useReveal<HTMLDivElement>('.story-panel:not([hidden])');
  // 탭을 한 번이라도 바꾸면 그때부터는 장면이 바뀔 때마다 등장 효과를 재생한다
  const [tabbed, setTabbed] = useState(false);
  return (
    <Tabs
      ref={ref}
      defaultValue='0'
      className='story'
      data-reveal={reveal}
      data-tabbed={tabbed || undefined}
      onValueChange={() => setTabbed(true)}
    >
      <TabsList className='story-tabs' aria-label='윤하늘 씨의 상담 장면'>
        {scenes.map((scene, index) => (
          <TabsTrigger key={scene.label} value={String(index)} className='story-tab'>
            <span className='story-tab-num'>{index + 1}</span>
            <span className='story-tab-label'>{scene.label}</span>
            <span className='story-tab-time'>{scene.time}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {scenes.map((scene, index) => (
        <TabsContent
          key={scene.label}
          value={String(index)}
          className='story-panel'
          // 숨긴 장면도 DOM에 두어 그림을 미리 받아 둔다(탭을 바꿀 때 그림이 늦게 뜨지 않게)
          keepMounted
        >
          <div className='story-art'>
            <Image src={scene.art} alt='' loading='eager' sizes='(max-width: 767px) 90vw, 416px' />
          </div>
          <ol className='story-chat'>
            {scene.messages.map((message) => (
              <li key={message.text} className={`bubble is-${message.from}`}>
                <span className='bubble-who'>
                  {message.from === 'agent' ? (
                    <>
                      <Bot aria-hidden /> 월급지도 AI
                    </>
                  ) : (
                    '윤하늘(가상)'
                  )}
                </span>
                <p>{message.text}</p>
                {message.files && (
                  <ul className='bubble-files' aria-label='첨부한 파일'>
                    {message.files.map((file) => (
                      <li key={file}>
                        <Paperclip aria-hidden /> {file}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </TabsContent>
      ))}
    </Tabs>
  );
}
