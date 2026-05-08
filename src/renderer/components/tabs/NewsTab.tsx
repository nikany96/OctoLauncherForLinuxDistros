import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';

import { type NewsItem } from '~main/types';
import { api } from '~renderer/utils/api';
import useScrollHint from '~renderer/utils/useScrollHint';

import IconSpinner from '../styled/IconSpinner';
import TextButton from '../styled/TextButton';

const formatDate = (raw: string) => {
	const d = new Date(raw);
	if (Number.isNaN(d.getTime())) return raw;
	return d.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
};

const NewsEntry = ({ item }: { item: NewsItem }) => {
	const openLink = api.general.openLink.useMutation();
	return (
		<article className="flex flex-col gap-1 border-b border-blueGray/30 pb-3 last:border-0">
			<div className="flex items-baseline justify-between gap-3">
				<h5 className="tw-color">{item.title}</h5>
				<span className="s1 shrink-0 text-blueGray">{formatDate(item.date)}</span>
			</div>
			{item.author && (
				<span className="s1 italic text-blueGray">by {item.author}</span>
			)}
			<p className="whitespace-pre-wrap text-sm leading-relaxed">{item.body}</p>
			{item.url && (
				<TextButton
					icon={ExternalLink}
					size={14}
					className="-ml-2 self-start text-pink"
					onClick={() => openLink.mutateAsync(item.url!)}
				>
					Read more
				</TextButton>
			)}
		</article>
	);
};

const NewsTab = () => {
	const query = api.news.list.useQuery(undefined, {
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
		retry: 1
	});
	const scrollRef = useScrollHint<HTMLDivElement>();

	return (
		<div className="tw-surface flex min-h-0 flex-grow flex-col gap-3">
			<div className="flex items-center justify-between">
				<h4 className="tw-color">News</h4>
				<TextButton
					icon={RefreshCw}
					size={18}
					className="-mr-2 text-blueGray"
					loading={query.isFetching}
					onClick={() => query.refetch()}
					title="Refresh"
				/>
			</div>
			<hr />
			<div
				ref={scrollRef}
				className="relative -m-4 -mt-0 flex flex-grow flex-col gap-3 overflow-y-auto overflow-x-hidden p-4 pt-0"
			>
				{query.isLoading ? (
					<div className="flex flex-grow flex-col items-center justify-center gap-2">
						<IconSpinner className="text-blueGray" />
						<p className="italic text-blueGray">Loading news...</p>
					</div>
				) : query.isError ? (
					<div className="flex flex-grow flex-col items-center justify-center gap-3">
						<AlertTriangle size={32} className="text-red" />
						<p className="italic text-blueGray">Couldn't reach the news feed.</p>
						<TextButton
							icon={RefreshCw}
							size={18}
							className="text-pink"
							onClick={() => query.refetch()}
						>
							Try again
						</TextButton>
					</div>
				) : !query.data?.length ? (
					<div className="flex flex-grow flex-col items-center justify-center">
						<p className="italic text-blueGray">No news yet — check back later.</p>
					</div>
				) : (
					query.data.map(item => <NewsEntry key={item.id} item={item} />)
				)}
			</div>
		</div>
	);
};

export default NewsTab;
