import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { FavoritesModal } from '@src/components/FavoritesModal';
import { removeFromFavorites } from '@src/services/api/favorites';
import { mockFavorites } from '../../../test-utils/helpers/test-data';

jest.mock('@src/services/api/favorites');

describe('FavoritesModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render modal when visible', () => {
    const { getByTestId } = render(
      <FavoritesModal
        visible={true}
        onClose={jest.fn()}
        initialFavorites={mockFavorites}
      />
    );

    expect(getByTestId('favorites-modal')).toBeTruthy();
  });

  it('should not render modal when not visible', () => {
    const { queryByTestId } = render(
      <FavoritesModal
        visible={false}
        onClose={jest.fn()}
        initialFavorites={mockFavorites}
      />
    );

    expect(queryByTestId('favorites-modal')).toBeNull();
  });

  it('should display favorites', () => {
    const { getByText } = render(
      <FavoritesModal
        visible={true}
        onClose={jest.fn()}
        initialFavorites={mockFavorites}
      />
    );

    expect(getByText('Избранное')).toBeTruthy();
    expect(getByText('Иван Иванов')).toBeTruthy();
  });

  it('should display empty state when no favorites', () => {
    const { getByText } = render(
      <FavoritesModal
        visible={true}
        onClose={jest.fn()}
        initialFavorites={[]}
      />
    );

    expect(getByText('Нет избранных элементов')).toBeTruthy();
  });

  it('should paginate favorites', () => {
    const manyFavorites = Array.from({ length: 15 }, (_, i) => ({
      ...mockFavorites[0],
      id: i + 1,
      favorite_name: `Favorite ${i + 1}`,
    }));

    const { getByTestId, getByText } = render(
      <FavoritesModal
        visible={true}
        onClose={jest.fn()}
        initialFavorites={manyFavorites}
      />
    );

    expect(getByTestId('favorites-modal-page-info')).toBeTruthy();
    expect(getByText('1 / 2')).toBeTruthy();
  });

  it('should navigate to next page', () => {
    const manyFavorites = Array.from({ length: 15 }, (_, i) => ({
      ...mockFavorites[0],
      id: i + 1,
      favorite_name: `Favorite ${i + 1}`,
    }));

    const { getByTestId, getByText } = render(
      <FavoritesModal
        visible={true}
        onClose={jest.fn()}
        initialFavorites={manyFavorites}
      />
    );

    const nextButton = getByTestId('favorites-modal-next');
    fireEvent.press(nextButton);

    expect(getByText('2 / 2')).toBeTruthy();
  });

  it('should navigate to previous page', () => {
    const manyFavorites = Array.from({ length: 15 }, (_, i) => ({
      ...mockFavorites[0],
      id: i + 1,
      favorite_name: `Favorite ${i + 1}`,
    }));

    const { getByTestId, getByText } = render(
      <FavoritesModal
        visible={true}
        onClose={jest.fn()}
        initialFavorites={manyFavorites}
      />
    );

    const nextButton = getByTestId('favorites-modal-next');
    fireEvent.press(nextButton);
    expect(getByText('2 / 2')).toBeTruthy();

    const prevButton = getByTestId('favorites-modal-prev');
    fireEvent.press(prevButton);
    expect(getByText('1 / 2')).toBeTruthy();
  });

  it('should disable prev button on first page', () => {
    const manyFavorites = Array.from({ length: 15 }, (_, i) => ({
      ...mockFavorites[0],
      id: i + 1,
      favorite_name: `Favorite ${i + 1}`,
    }));

    const { getByTestId } = render(
      <FavoritesModal
        visible={true}
        onClose={jest.fn()}
        initialFavorites={manyFavorites}
      />
    );

    const prevButton = getByTestId('favorites-modal-prev');
    expect(prevButton.props.disabled).toBe(true);
  });

  it('should disable next button on last page', () => {
    const manyFavorites = Array.from({ length: 15 }, (_, i) => ({
      ...mockFavorites[0],
      id: i + 1,
      favorite_name: `Favorite ${i + 1}`,
    }));

    const { getByTestId } = render(
      <FavoritesModal
        visible={true}
        onClose={jest.fn()}
        initialFavorites={manyFavorites}
      />
    );

    const nextButton = getByTestId('favorites-modal-next');
    fireEvent.press(nextButton);

    expect(nextButton.props.disabled).toBe(true);
  });

  it('should remove favorite', async () => {
    (removeFromFavorites as jest.Mock).mockResolvedValue(undefined);

    const onFavoriteRemoved = jest.fn();
    const { getAllByTestId } = render(
      <FavoritesModal
        visible={true}
        onClose={jest.fn()}
        initialFavorites={mockFavorites}
        onFavoriteRemoved={onFavoriteRemoved}
      />
    );

    const removeButtons = getAllByTestId('favorites-modal-remove');
    fireEvent.press(removeButtons[0]);

    await waitFor(() => {
      expect(removeFromFavorites).toHaveBeenCalled();
      expect(onFavoriteRemoved).toHaveBeenCalled();
    });
  });

  it('should close modal when close button is pressed', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <FavoritesModal
        visible={true}
        onClose={onClose}
        initialFavorites={mockFavorites}
      />
    );

    const closeButton = getByTestId('favorites-modal-close');
    fireEvent.press(closeButton);

    expect(onClose).toHaveBeenCalled();
  });
});

