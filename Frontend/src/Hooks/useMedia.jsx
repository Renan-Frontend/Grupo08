import React from 'react';

const useMedia = (media) => {
  const [match, setMatch] = React.useState(null);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(media);
    const changeMatch = () => setMatch(mediaQuery.matches);

    changeMatch();
    mediaQuery.addEventListener('change', changeMatch);
    return () => mediaQuery.removeEventListener('change', changeMatch);
  }, [media]);

  return match;
};

export default useMedia;
